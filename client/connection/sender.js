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
 * The returned promise uses lazy timeout activation - the timeout only
 * starts counting when `.then()` or `.catch()` is called on the promise.
 * This prevents timeouts from triggering for fire-and-forget messages.
 *
 * @param {function(): WebSocket} getSocket - Function that returns the current WebSocket instance
 * @param {Object.<string, function(Error|null, any): void>} waitingOn - Map of query IDs to response callbacks
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
 * // Fire and forget (no await) - timeout won't trigger
 * wsSend('/api/log', { event: 'pageview' }, Date.now())
 */
export function createWsSend(getSocket, waitingOn) {
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
    let promiseIsLive = false;
    const timeLeftForReqToBeMade = createdAt + totalRequestTimeout - Date.now();

    // Setup timeout timer
    const timer = setTimeout(() => {
      if (promiseIsLive) {
        rej(new Error("Request Timed out for: " + type));
      }
    }, timeLeftForReqToBeMade);

    // Process binary data in the payload
    const { processedData, uploads } = processBinaryForUpload(data);

    // Build the message payload
    const payload = {
      type,
      data: processedData,
      createdAt: new Date(createdAt),
      requestedAt: new Date(),
    };

    // Serialize and generate query ID for response correlation
    const message = jss.stringify(payload);
    const queryId = messageHash(message);

    /**
     * Promise that resolves when server responds to this query
     * @type {Promise<any>}
     */
    const replyPromise = new Promise((resolve, reject) => {
      rej = reject;

      // Register callback for when response arrives
      waitingOn[queryId] = (err, result) => {
        clearTimeout(timer);
        // Restore normal promise behavior after response
        replyPromise.then = next.bind(replyPromise);
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      };

      // Send the message
      getSocket().send(message);

      // Upload any binary data via HTTP
      if (uploads.length > 0) {
        uploadBinaryData(queryId, uploads).catch((err) => {
          console.error("🦍 Binary upload failed:", err);
        });
      }
    });

    // Store original then/catch for lazy timeout activation
    const next = replyPromise.then;

    /**
     * Wrapped .then() that activates the timeout on first call
     * This implements lazy timeout - timeout only starts when
     * someone actually waits for the response
     */
    replyPromise.then = (worker) => {
      promiseIsLive = true;
      replyPromise.then = next.bind(replyPromise);
      replyPromise.catch = err.bind(replyPromise);
      return next.call(replyPromise, worker);
    };

    const err = replyPromise.catch;

    /**
     * Wrapped .catch() that activates the timeout on first call
     */
    replyPromise.catch = (worker) => {
      promiseIsLive = true;
      replyPromise.catch = err.bind(replyPromise);
      replyPromise.then = next.bind(replyPromise);
      return err.call(replyPromise, worker);
    };

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
   * @throws {Error} If connection timeout occurs while message is queued
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
      waiting: false,
      createdAt,
      timer: null,
    };

    // Setup connection timeout
    payload.timer = setTimeout(() => {
      const errMessage = "Request not sent for: " + type;
      if (payload.waiting) {
        payload.reject(new Error(errMessage));
      } else {
        throw new Error(errMessage);
      }
    }, timeLeftForReqToBeMade);

    /**
     * Promise that resolves when the message is sent and response received
     * @type {Promise<any>}
     */
    const waitingOnOpen = new Promise((res, rej) => {
      payload.resolve = res;
      payload.reject = rej;
    });

    // Store original promise methods
    const waitingOnOpenThen = waitingOnOpen.then;
    const waitingOnOpenCatch = waitingOnOpen.catch;

    /**
     * Wrapped .then() that marks the payload as being waited on
     * This enables proper timeout handling
     */
    waitingOnOpen.then = (worker) => {
      payload.waiting = true;
      waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen);
      waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen);
      return waitingOnOpenThen.call(waitingOnOpen, worker);
    };

    /**
     * Wrapped .catch() that marks the payload as being waited on
     */
    waitingOnOpen.catch = (worker) => {
      payload.waiting = true;
      waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen);
      waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen);
      return waitingOnOpenCatch.call(waitingOnOpen, worker);
    };

    // Add to queue and trigger connection
    waitingQueue.push(payload);
    connectFn();

    return waitingOnOpen;
  };
}
