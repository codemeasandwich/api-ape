/**
 * @fileoverview Client Connection Management for api-ape Node.js Client
 *
 * This module provides WebSocket connection management for the server-side
 * api-ape client. It handles:
 *
 * - WebSocket connection lifecycle (connect, disconnect, reconnect)
 * - Connection state tracking and notifications
 * - Message sending with request/response correlation
 * - Event subscription (typed and untyped)
 * - Request queuing during disconnection
 *
 * The connection automatically reconnects on disconnection unless explicitly
 * closed via `close()`. Requests made while disconnected are queued and
 * sent once the connection is re-established.
 *
 * @module server/client/connection
 * @see {@link module:server/client} - Main client module
 * @see {@link module:utils/jss} - JSON SuperSet encoding/decoding
 *
 * @example
 * const { connect, close, on, onConnectionChange, ConnectionState } = require('./connection')
 *
 * // Establish connection
 * connect('localhost', 3000)
 *
 * // Monitor connection state
 * onConnectionChange(state => {
 *     console.log('State:', state)
 * })
 *
 * // Subscribe to events
 * on('message', data => {
 *     console.log('Received:', data)
 * })
 */

const jss = require("../../utils/jss");
const messageHash = require("../../utils/messageHash");
const { WebSocket: WsPolyfill } = require("../lib/ws");
const receivers = require("./connection-receivers");

/**
 * WebSocket constructor - uses native if available, falls back to polyfill.
 * @private
 * @type {typeof WebSocket}
 */
const WebSocket = globalThis.WebSocket || WsPolyfill;

/**
 * Connection state enumeration.
 * Represents the possible states of the WebSocket connection.
 *
 * @readonly
 * @enum {string}
 * @property {string} Disconnected - Not connected to server
 * @property {string} Connecting - Connection attempt in progress
 * @property {string} Connected - Successfully connected and ready
 * @property {string} Closing - Connection is being gracefully closed
 *
 * @example
 * const { ConnectionState, onConnectionChange } = require('./connection')
 *
 * onConnectionChange(state => {
 *     if (state === ConnectionState.Connected) {
 *         console.log('Ready to communicate')
 *     }
 * })
 */
const ConnectionState = {
  Disconnected: "disconnected",
  Connecting: "connecting",
  Connected: "connected",
  Closing: "closing",
};

/* ========== INTERNAL STATE ========== */

/**
 * Active WebSocket connection instance.
 * @private
 * @type {WebSocket|null}
 */
let ws = null;

/**
 * Map of pending request callbacks keyed by query ID.
 * Each callback receives (error, result) when the server responds.
 * @private
 * @type {Object<string, function(Error|null, *): void>}
 */
const waitingOn = {};

/**
 * Queue of requests waiting to be sent when connection is established.
 * @private
 * @type {Array<{type: string, data: *, resolve: function, reject: function, createdAt: number, timer: NodeJS.Timeout}>}
 */
let bufferedCalls = [];

/**
 * Whether the connection is ready to send messages.
 * @private
 * @type {boolean}
 */
let ready = false;

/**
 * Whether auto-reconnect is enabled.
 * Disabled by calling close(), re-enabled by calling connect().
 * @private
 * @type {boolean}
 */
let reconnectEnabled = true;

/**
 * Timer ID for reconnect delay.
 * @private
 * @type {NodeJS.Timeout|null}
 */
let reconnectTimer = null;

/**
 * Server WebSocket URL.
 * Can be set via APE_SERVER environment variable or connect() arguments.
 * @private
 * @type {string|null}
 */
let serverUrl = process.env.APE_SERVER || null;

/* ========== CONFIGURATION CONSTANTS ========== */

/**
 * Timeout for initial connection in milliseconds.
 * Queued requests will be rejected after this time if connection isn't established.
 * @private
 * @constant {number}
 */
const connectTimeout = 5000;

/**
 * Total timeout for a request in milliseconds.
 * Includes time spent waiting for server response.
 * @private
 * @constant {number}
 */
const totalRequestTimeout = parseInt(process.env.APE_REQUEST_TIMEOUT, 10) || 120000;

/* ========== RECEIVER MODULE BINDING ========== */

/**
 * Inject live connection state into the receiver module.
 * This late-binding avoids circular dependency — receivers need
 * to check ready/serverUrl/ws but connection.js owns those vars.
 * Must happen at module load time, before any on() calls.
 */
receivers.bindConnection({
  getReady: () => ready,
  getServerUrl: () => serverUrl,
  getWs: () => ws,
  triggerConnect: () => connect(),
});

/* ========== INTERNAL FUNCTIONS ========== */

/**
 * Sends a message over the WebSocket and returns a promise for the response.
 *
 * The message is assigned a unique query ID that correlates the request
 * with the server's response. A timeout ensures the promise doesn't hang
 * indefinitely if the server doesn't respond.
 *
 * @private
 * @function send
 * @param {string} type - The message type (API path)
 * @param {*} data - The request payload
 * @param {number} [createdAt=Date.now()] - Timestamp for timeout calculation
 * @returns {Promise<*>} Promise resolving to the server's response data
 * @throws {Error} If the request times out
 *
 * @example
 * const result = await send('/users/list', { limit: 10 })
 */
function send(type, data, createdAt = Date.now()) {
  // Serialize the message without a queryId — the server computes the
  // queryId by hashing the raw message string (Jenkins one-at-a-time).
  // The client hashes the same string so both sides agree on the queryId
  // for request/response correlation.
  const message = jss.stringify({ type, data, createdAt });
  const queryId = messageHash(message);

  return new Promise((resolve, reject) => {
    // Mutable timer ref — keepalive signals from the server reset this
    // timer to prevent long-running RPC calls from timing out.
    const timerRef = {};
    /**
     * Start (or restart) the response timeout timer.
     * Resets on each keepalive signal from the server so long-running
     * RPCs don't time out while the server is actively processing.
     * Rejects the promise with a diagnostic error if no response arrives.
     */
    const startTimer = () => {
      clearTimeout(timerRef.id);
      timerRef.id = setTimeout(() => {
        delete waitingOn[queryId];
        // Diagnostic timeout error message containing What, Why, and How to prevent it.
        reject(new Error(
          `Failed to receive response for request '${type}'. ` +
          `The server did not respond within the ${totalRequestTimeout}ms timeout limit. ` +
          `To fix this, check if the server is overloaded, verify the route for '${type}' is fully implemented and returning a value, or increase the timeout limit via the APE_REQUEST_TIMEOUT environment variable (currently ${totalRequestTimeout}ms).`
        ));
      }, totalRequestTimeout);
    };
    startTimer();

    // Register callback for when response arrives.
    // The _keepalive flag is set when the server sends a heartbeat
    // to indicate the request is still being processed. In that case,
    // we reset the timer but do NOT resolve the promise.
    waitingOn[queryId] = (err, result, _keepalive) => {
      if (_keepalive) {
        startTimer();
        return;
      }
      clearTimeout(timerRef.id);
      if (err) {
        // Wrap a remote string error with context indicating it originated remotely
        reject(typeof err === "string" ? new Error(`Remote RPC error on '${type}': ${err}`) : err);
      } else {
        resolve(result);
      }
    };

    // Send the pre-serialized message
    ws.send(message);
  });
}


/* ========== PUBLIC FUNCTIONS ========== */

/**
 * Establishes a WebSocket connection to the api-ape server.
 *
 * If host and port are provided, constructs the WebSocket URL.
 * Otherwise, uses the APE_SERVER environment variable.
 *
 * The connection:
 * - Auto-reconnects on disconnection (unless close() was called)
 * - Processes buffered receivers and queued requests on connect
 * - Parses incoming messages with JSS and routes to handlers
 *
 * @function connect
 * @param {string} [host] - Server hostname (e.g., 'localhost')
 * @param {number} [port] - Server port (e.g., 3000)
 *
 * @example
 * // Connect with explicit host and port
 * connect('localhost', 3000)
 *
 * @example
 * // Connect using APE_SERVER environment variable
 * process.env.APE_SERVER = 'ws://api.example.com/api/ape'
 * connect()
 */
function connect(host, port) {
  // Build URL from arguments if provided
  if (typeof host === "string" && typeof port === "number") {
    serverUrl = `ws://${host}:${port}/api/ape`;
  }
  if (!serverUrl) return;

  // Don't create duplicate connections
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  receivers.notifyConnectionChange(ConnectionState.Connecting);
  ws = new WebSocket(serverUrl);

  /**
   * Handle successful connection.
   * Registers buffered receivers and sends queued requests.
   */
  ws.onopen = () => {
    ready = true;
    receivers.notifyConnectionChange(ConnectionState.Connected);

    // Register any receivers that were added while disconnected
    receivers.flushBufferedReceivers();

    // Send any requests that were queued while disconnected
    bufferedCalls.forEach(
      ({ type, data, resolve, reject, createdAt, timer }) => {
        clearTimeout(timer);
        send(type, data, createdAt).then(resolve).catch(reject);
      },
    );
    bufferedCalls = [];
  };

  /**
   * Handle incoming messages.
   * Routes responses to waiting callbacks, broadcasts to receivers.
   */
  ws.onmessage = (event) => {
    const msg = jss.parse(
      typeof event.data === "string" ? event.data : event.data.toString(),
    );
    const { err, type, queryId, data, _keepalive } = msg;

    // If this is a response to a pending request, invoke the callback.
    // Keepalive signals reset the timer without resolving the promise.
    if (queryId && waitingOn[queryId]) {
      if (_keepalive) {
        waitingOn[queryId](null, null, true);
        return;
      }
      waitingOn[queryId](err, data);
      delete waitingOn[queryId];
      return;
    }

    // Dispatch to typed and general receivers via the receiver module
    receivers.dispatchToReceivers(type, err, data);
  };

  /**
   * Handle WebSocket errors.
   * Logs full diagnostic context so a developer reading logs from any
   * service in the stack can identify the failing service, what went
   * wrong, and exactly how to fix it. Does not reject pending requests
   * here — onclose always fires after onerror and handles that.
   */
  ws.onerror = (err) => {
    const pendingCount = Object.keys(waitingOn).length;
    const detail = err.message || '(no message — raw ErrorEvent)';
    // Extract host:port safely — serverUrl is a ws:// URL, avoid
    // throwing in the error handler if it's somehow malformed.
    let hostPort = 'unknown';
    try { const u = new URL(serverUrl); hostPort = `${u.hostname}:${u.port}`; } catch (_) {}
    console.error(
      `🦍 [api-ape client] WebSocket connection to ${serverUrl || 'unknown'} failed. ` +
      `${pendingCount} pending RPC request(s) will be rejected on close. ` +
      `Detail: ${detail}. ` +
      `Fix: 1) Verify the server is running: curl http://${hostPort}/health ` +
      `2) Check server logs for crashes or port conflicts. ` +
      `3) If the server is running, check for firewall or proxy issues on ${hostPort}. ` +
      `4) Increase APE_REQUEST_TIMEOUT (currently ${totalRequestTimeout}ms) if the server is slow to respond.`
    );
  };

  /**
   * Handle connection close.
   * Rejects all pending RPC callbacks immediately so callers fail fast
   * instead of hanging until their individual timeout fires (up to 120s).
   * Triggers auto-reconnect after delay if enabled.
   */
  ws.onclose = () => {
    ready = false;

    // Reject all pending RPC callbacks — the socket is gone,
    // they will never receive a response. Fail fast so retry
    // logic (e.g. Marvin's retryWithBackoff) can kick in.
    // Pass Error objects (not strings) so the send() callback
    // rejects directly without wrapping as "Remote RPC error".
    const pendingIds = Object.keys(waitingOn);
    if (pendingIds.length > 0) {
      // Extract host:port safely — avoid throwing in the close
      // handler if serverUrl is somehow malformed.
      let hostPort = 'unknown';
      let port = '??';
      try { const u = new URL(serverUrl); hostPort = `${u.hostname}:${u.port}`; port = u.port; } catch (_) {}
      const disconnectErr = new Error(
        `[api-ape client] WebSocket to ${serverUrl || 'unknown'} closed while ${pendingIds.length} RPC request(s) were awaiting responses. ` +
        `The server may have crashed, restarted, or the network dropped. ` +
        `Fix: 1) Check server process is alive: lsof -i :${port} ` +
        `2) Check server logs for errors or OOM kills. ` +
        `3) Verify network connectivity: curl http://${hostPort}/health ` +
        `4) If the server is restarting, the client will auto-reconnect in 1s — retryable callers should retry the request.`
      );
      for (const qid of pendingIds) {
        waitingOn[qid](disconnectErr);
        delete waitingOn[qid];
      }
    }

    ws = null;
    receivers.notifyConnectionChange(ConnectionState.Disconnected);

    // Auto-reconnect after 1 second if not explicitly closed
    if (reconnectEnabled && serverUrl) {
      reconnectTimer = setTimeout(() => connect(), 1000);
    }
  };
}

/**
 * Closes the WebSocket connection and disables auto-reconnect.
 *
 * Call this when you want to cleanly shut down the connection.
 * To re-enable auto-reconnect, call connect() again.
 *
 * @function close
 *
 * @example
 * // Clean shutdown
 * process.on('SIGTERM', () => {
 *     close()
 *     process.exit(0)
 * })
 */
function close() {
  reconnectEnabled = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    receivers.notifyConnectionChange(ConnectionState.Closing);
    ws.close();
  }
}

/**
 * Queues a request or sends it immediately if connected.
 *
 * When connected, immediately sends the request.
 * When disconnected, queues the request to be sent on connection.
 * Queued requests timeout after connectTimeout milliseconds.
 *
 * @function queueOrSend
 * @param {string} type - The message type (API path)
 * @param {*} data - The request payload
 * @returns {Promise<*>} Promise resolving to the server's response
 * @throws {Error} If connection times out while queued
 *
 * @example
 * // Will send immediately if connected, or queue if not
 * const users = await queueOrSend('/users/list', { limit: 10 })
 */
function queueOrSend(type, data) {
  // If connected, send immediately
  if (ready && ws && ws.readyState === WebSocket.OPEN) {
    return send(type, data);
  }

  // Otherwise, queue for later
  return new Promise((resolve, reject) => {
    const createdAt = Date.now();

    // Set up connection timeout
    const timer = setTimeout(() => {
      const idx = bufferedCalls.findIndex((m) => m.createdAt === createdAt);
      if (idx > -1) bufferedCalls.splice(idx, 1);
      // Diagnostic timeout error message indicating host failure
      reject(new Error(
        `Failed to queue and send request '${type}'. ` +
        `The WebSocket connection to '${serverUrl || "unknown host"}' could not be established within the ${connectTimeout}ms limit. ` +
        `To fix this, ensure the api-ape server is currently running on the target host and port, and check for network or firewall blockage.`
      ));
    }, connectTimeout);

    // Add to queue
    bufferedCalls.push({ type, data, resolve, reject, createdAt, timer });

    // Trigger connection if not already connecting
    if (!ws && serverUrl) {
      connect();
    }
  });
}

/* ========== EXPORTS ========== */

module.exports = {
  /** Connection state enumeration */
  ConnectionState,
  /** Establish connection to server */
  connect,
  /** Close connection and disable auto-reconnect */
  close,
  /** Send a message (internal, requires active connection) */
  send,
  /** Queue or send a message */
  queueOrSend,
  /** Subscribe to server events (delegated to connection-receivers) */
  on: receivers.on,
  /** Subscribe to connection state changes (delegated to connection-receivers) */
  onConnectionChange: receivers.onConnectionChange,
  /** Register a message receiver (delegated to connection-receivers) */
  setOnReceiver: receivers.setOnReceiver,
  /** Remove a message receiver (delegated to connection-receivers) */
  removeOnReceiver: receivers.removeOnReceiver,
  /** Notify connection state change (delegated to connection-receivers) */
  notifyConnectionChange: receivers.notifyConnectionChange,
  /** Check if connection is ready (delegated to connection-receivers) */
  isReady: receivers.isReady,
  /** Get WebSocket instance (delegated to connection-receivers) */
  getWs: receivers.getWs,
  /** WebSocket constructor (native or polyfill) */
  WebSocket,
};
