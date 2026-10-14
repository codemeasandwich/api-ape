/**
 * @fileoverview Message sending logic for WebSocket transport
 *
 * This module provides functions for sending messages over WebSocket connections
 * with support for:
 * - Request/response correlation via query IDs
 * - Automatic timeout handling
 * - Binary data upload processing
 * - Message queuing when connection is not ready
 *
 * ## Architecture
 *
 * The module provides two main functions:
 * 1. `createWsSend` - Creates a function for sending messages over an active WebSocket
 * 2. `createSender` - Creates a function that queues messages when not connected
 *
 * ## Request Flow
 *
 * ```
 * sender(type, data)
 *   │
 *   ├─► Connection ready? ─► YES ─► wsSend() ─► WebSocket.send()
 *   │                                  │
 *   │                                  └─► Wait for response (via queryId)
 *   │
 *   └─► NO ─► Queue message ─► Wait for connection ─► Flush queue
 * ```
 *
 * @module client/connection/sender
 * @see {@link module:client/connectSocket} for connection management
 * @see {@link module:client/connection/fileHandling} for binary data processing
 *
 * @example
 * // Create WebSocket sender
 * const wsSend = createWsSend(() => socket, waitingOn)
 *
 * // Send a message and wait for response
 * const response = await wsSend('/chat', { message: 'Hello!' }, Date.now())
 *
 * @example
 * // Create queuing sender for connection management
 * const sender = createSender(
 *   () => isReady,
 *   () => wsSend,
 *   messageQueue,
 *   connectFn
 * )
 *
 * // Messages are queued if not connected
 * sender('/users', { name: 'Alice' })
 */

import { apeLog } from "../../utils/apeLogger.js";
import messageHash from "../../utils/messageHash";
import jss from "../../utils/jss";
import { processBinaryForUpload, uploadBinaryData } from "./fileHandling";

/**
 * Total timeout for a request to complete (milliseconds)
 * Includes time waiting for connection + time waiting for response
 * @constant {number}
 */
const totalRequestTimeout = 10000;

/**
 * Timeout for initial connection when message is queued (milliseconds)
 * @constant {number}
 */
const connectTimeout = 5000;

/**
 * Create a WebSocket send function bound to a socket getter
 *
 * This factory function creates a send function that:
 * 1. Serializes the message payload with JSS (handles Dates, RegExp, etc.)
 * 2. Generates a unique query ID for request/response correlation
 * 3. Extracts and uploads any binary data via HTTP
 * 4. Sends the message over WebSocket
 * 5. Returns a Promise that resolves when the response arrives
 *
 * ## Timeout Behavior
 *
 * The timeout is armed when the call is made (10 s from the call's creation,
 * restarted by each server keepalive). A call nobody awaits does not raise an
 * unhandled rejection when it fails or times out.
 *
 * @param {function(): WebSocket} getSocket - Function that returns the current WebSocket instance
 * @param {Object.<string, function(Error|null, any, boolean=): void>} waitingOn - Map of query IDs to response
 *   callbacks; a third argument `true` means "keepalive frame: restart the timeout, do not settle"
 * @returns {function(string, any, number, boolean=): Promise<any>} Send function
 *
 * @example
 * const waitingOn = {}
 * const wsSend = createWsSend(() => myWebSocket, waitingOn)
 *
 * // Send message and await response
 * try {
 *   const result = await wsSend('/api/users', { name: 'Alice' }, Date.now())
 *   console.log('Server responded:', result)
 * } catch (err) {
 *   console.error('Request failed:', err)
 * }
 *
 * @example
 * // Fire and forget (no await) - failure or timeout is swallowed
 * wsSend('/api/log', { event: 'pageview' }, Date.now())
 */
export function createWsSend(getSocket, waitingOn) {
  // Per-client counter sent as `nonce`: two identical calls in the same millisecond
  // would otherwise serialize to the same message, hash to the same queryId, and the
  // server would refuse the second as a replay.
  let nonce = 0;

  /**
   * Send a message over WebSocket and return a Promise for the response
   *
   * @param {string} type - Message type/endpoint path (e.g., '/chat', '/users')
   * @param {any} data - Payload data to send (will be serialized with JSS)
   * @param {number} createdAt - Timestamp when the request was initiated
   * @param {boolean} [directCall] - Reserved for future use (previously controlled requestedAt)
   * @returns {Promise<any>} Promise resolving to the server's response data
   * @throws {Error} If request times out or server returns an error
   */
  return function wsSend(type, data, createdAt, directCall) {
    /** @type {function(Error): void} */
    let rej;
    const timeLeftForReqToBeMade = createdAt + totalRequestTimeout - Date.now();

    // Timeout timer. The server's `this.keepalive()` restarts it (`armTimer`).
    let timer;
    /**
     * (Re)start the timeout for this call.
     *
     * @param {number} ms - Milliseconds until the call is rejected as timed out
     * @returns {void}
     */
    const armTimer = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Expired: forget the call, or its callback stays in `waitingOn` for good.
        delete waitingOn[queryId];
        rej(new Error("Request Timed out for: " + type));
      }, ms);
    };

    // Process binary data in the payload
    const { processedData, uploads } = processBinaryForUpload(data);

    // Build the message payload
    const payload = {
      type,
      data: processedData,
      createdAt: new Date(createdAt),
      requestedAt: new Date(),
      nonce: ++nonce,
    };

    // Serialize and generate query ID for response correlation
    const message = jss.stringify(payload);
    const queryId = messageHash(message);

    // Armed only now: if the payload cannot be serialised (a BigInt argument) the call
    // throws above, and a timer armed earlier would fire 10 s later on a call that is gone.
    armTimer(timeLeftForReqToBeMade);

    /**
     * Promise that resolves when server responds to this query
     * @type {Promise<any>}
     */
    const replyPromise = new Promise((resolve, reject) => {
      rej = reject;

      // Register callback for when response arrives
      waitingOn[queryId] = (err, result, keepalive) => {
        // A keepalive frame is not the reply: give the call a fresh window and wait on.
        if (keepalive) {
          armTimer(totalRequestTimeout);
          return;
        }
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      };

      // Send the message. If that throws (no socket, or it is closing) the call is
      // over: stop its timer and forget it, rather than leave both behind.
      try {
        getSocket().send(message);
      } catch (sendErr) {
        clearTimeout(timer);
        delete waitingOn[queryId];
        reject(sendErr);
        return;
      }

      // Upload any binary data via HTTP
      if (uploads.length > 0) {
        uploadBinaryData(queryId, uploads).catch((err) => {
          apeLog.error("Binary upload failed:", err);
        });
      }
    });

    // The timeout is armed at creation, so `await api.x()` and `.then(ok, err)` both see
    // it (4.3.0 armed it lazily inside a custom `then` that dropped its second argument).
    // A call nobody looks at (fire and forget) must not raise an unhandled rejection
    // when it fails or times out, hence the no-op handler; `await` and `.then` on the
    // returned promise still receive the error.
    replyPromise.catch(() => {});

    return replyPromise;
  };
}

/**
 * Create a sender function that queues messages when not connected
 *
 * This factory creates a sender function that handles the case when
 * the WebSocket connection is not yet ready. Messages are queued and
 * sent once the connection is established.
 *
 * ## Behavior
 *
 * - If connection is ready: Sends immediately via wsSend
 * - If connection is not ready: Queues the message and triggers connection
 * - Queued messages timeout after `connectTimeout` if connection isn't established
 *
 * @param {function(): boolean} isReady - Function returning true if connection is ready
 * @param {function(): function} getSendFn - Function returning the current send function
 * @param {Array<Object>} waitingQueue - Queue array for pending messages
 * @param {function(): void} connectFn - Function to initiate connection
 * @returns {function(string, any): Promise<any>} Sender function
 *
 * @example
 * const messageQueue = []
 * const sender = createSender(
 *   () => connectionReady,
 *   () => wsSend,
 *   messageQueue,
 *   connectSocket
 * )
 *
 * // Will queue if not connected, send immediately if connected
 * const result = await sender('/api/data', { key: 'value' })
 *
 * @example
 * // Fire multiple requests - they'll queue and send in order
 * sender('/api/users', { action: 'list' })
 * sender('/api/products', { category: 'electronics' })
 * sender('/api/orders', { status: 'pending' })
 * // All will be sent once connection is ready
 */
export function createSender(isReady, getSendFn, waitingQueue, connectFn) {
  /**
   * Send a message to the server
   *
   * @param {string} type - Message type/endpoint path (must be a string)
   * @param {any} data - Payload data to send
   * @returns {Promise<any>} Promise resolving to the server's response
   * @throws {Error} If type is not a string
   * @throws {Error} Never synchronously for a timeout: a call still queued after the connect timeout
   *   rejects its promise instead
   */
  return function sender(type, data) {
    if ("string" !== typeof type) {
      throw new Error("Missing Path value");
    }

    const createdAt = Date.now();

    // If ready, send immediately
    if (isReady()) {
      return getSendFn()(type, data, createdAt, true);
    }

    // Calculate remaining time before timeout
    const timeLeftForReqToBeMade = createdAt + connectTimeout - Date.now();

    /**
     * Payload object stored in the waiting queue
     * @type {Object}
     */
    const payload = {
      type,
      data,
      resolve: undefined,
      reject: undefined,
      createdAt,
      timer: null,
    };

    // Setup connection timeout: a call still queued after `connectTimeout` is
    // rejected and leaves the queue (so it is not sent late, after the page gave up).
    payload.timer = setTimeout(() => {
      const queued = waitingQueue.indexOf(payload);
      if (queued >= 0) waitingQueue.splice(queued, 1);
      payload.reject(new Error("Request not sent for: " + type));
    }, timeLeftForReqToBeMade);

    /**
     * Promise that resolves when the message is sent and response received
     * @type {Promise<any>}
     */
    const waitingOnOpen = new Promise((res, rej) => {
      payload.resolve = res;
      payload.reject = rej;
    });

    // A queued call nobody looks at must not raise an unhandled rejection (or, as in
    // 4.3.0, throw from the timer) when it expires; `await` and `.then` still get the error.
    waitingOnOpen.catch(() => {});

    // Add to queue and trigger connection
    waitingQueue.push(payload);
    connectFn();

    return waitingOnOpen;
  };
}

/**
 * Send every queued call through the now-ready transport and empty the queue.
 *
 * The queue is emptied IN PLACE (`splice`): `createSender` pushes onto this same
 * array object, so replacing it with a new array (as 4.3.0 did) left later calls
 * queued on the old array, never flushed.
 *
 * @param {Array<Object>} waitingQueue - Queue shared with `createSender`
 * @param {function(string, any, number): Promise<any>} sendFn - Bound sender (`wsSend` or streaming `send`)
 * @returns {void}
 */
export function flushQueue(waitingQueue, sendFn) {
  waitingQueue.splice(0).forEach(
    ({ type, data, resolve, reject, createdAt, timer }) => {
      clearTimeout(timer);
      const result = sendFn(type, data, createdAt);
      result.then(resolve, reject);
    },
  );
}
