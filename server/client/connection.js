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

// ============================================================================
// INTERNAL STATE
// ============================================================================

/**
 * Active WebSocket connection instance.
 * @private
 * @type {WebSocket|null}
 */
let ws = null;

/**
 * Current connection state.
 * @private
 * @type {string}
 */
let connectionState = ConnectionState.Disconnected;

/**
 * Array of connection state change listeners.
 * @private
 * @type {Array<function(string): void>}
 */
const connectionChangeListeners = [];

/**
 * Map of pending request callbacks keyed by query ID.
 * Each callback receives (error, result) when the server responds.
 * @private
 * @type {Object<string, function(Error|null, *): void>}
 */
const waitingOn = {};

/**
 * Array of general message receivers (handles all message types).
 * @private
 * @type {Array<function({err: *, type: string, data: *}): void>}
 */
const receiverArray = [];

/**
 * Map of typed message receivers keyed by message type.
 * @private
 * @type {Object<string, Array<function({err: *, type: string, data: *}): void>>}
 */
const ofTypesOb = {};

/**
 * Queue of requests waiting to be sent when connection is established.
 * @private
 * @type {Array<{type: string, data: *, resolve: function, reject: function, createdAt: number, timer: NodeJS.Timeout}>}
 */
let bufferedCalls = [];

/**
 * Queue of receivers waiting to be registered when connection is established.
 * @private
 * @type {Array<{type: string|null, handler: function}>}
 */
let bufferedReceivers = [];

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

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

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
const totalRequestTimeout = 10000;

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Notifies all listeners of a connection state change.
 * Only triggers if the state actually changed.
 *
 * @private
 * @function notifyConnectionChange
 * @param {string} newState - The new connection state
 */
function notifyConnectionChange(newState) {
  if (connectionState !== newState) {
    connectionState = newState;
    connectionChangeListeners.forEach((fn) => fn(newState));
  }
}

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
    // Set up timeout for server response
    const timer = setTimeout(() => {
      delete waitingOn[queryId];
      reject(new Error(`Request timeout: ${type}`));
    }, totalRequestTimeout);

    // Register callback for when response arrives
    waitingOn[queryId] = (err, result) => {
      clearTimeout(timer);
      if (err) reject(typeof err === "string" ? new Error(err) : err);
      else resolve(result);
    };

    // Send the pre-serialized message
    ws.send(message);
  });
}

/**
 * Registers a message receiver for a specific type or all messages.
 *
 * @private
 * @function setOnReceiver
 * @param {string|null} type - Message type to listen for, or null for all
 * @param {function} handler - Callback function for received messages
 */
function setOnReceiver(type, handler) {
  if (type === null) {
    receiverArray.push(handler);
  } else {
    if (!ofTypesOb[type]) ofTypesOb[type] = [];
    ofTypesOb[type].push(handler);
  }
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

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

  notifyConnectionChange(ConnectionState.Connecting);
  ws = new WebSocket(serverUrl);

  /**
   * Handle successful connection.
   * Registers buffered receivers and sends queued requests.
   */
  ws.onopen = () => {
    ready = true;
    notifyConnectionChange(ConnectionState.Connected);

    // Register any receivers that were added while disconnected
    bufferedReceivers.forEach(({ type, handler }) =>
      setOnReceiver(type, handler),
    );
    bufferedReceivers = [];

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
    const { err, type, queryId, data } = msg;

    // If this is a response to a pending request, invoke the callback
    if (queryId && waitingOn[queryId]) {
      waitingOn[queryId](err, data);
      delete waitingOn[queryId];
      return;
    }

    // Otherwise, broadcast to type-specific receivers
    if (ofTypesOb[type]) ofTypesOb[type].forEach((h) => h({ err, type, data }));

    // And to general receivers
    receiverArray.forEach((h) => h({ err, type, data }));
  };

  /**
   * Handle WebSocket errors.
   * Logs the error but doesn't close the connection (onclose will fire).
   */
  ws.onerror = (err) =>
    console.error("🦍 api-ape client error:", err.message || err);

  /**
   * Handle connection close.
   * Triggers auto-reconnect after delay if enabled.
   */
  ws.onclose = () => {
    ready = false;
    ws = null;
    notifyConnectionChange(ConnectionState.Disconnected);

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
    notifyConnectionChange(ConnectionState.Closing);
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
      reject(new Error(`Connection timeout: ${type}`));
    }, connectTimeout);

    // Add to queue
    bufferedCalls.push({ type, data, resolve, reject, createdAt, timer });

    // Trigger connection if not already connecting
    if (connectionState === ConnectionState.Disconnected && serverUrl) {
      connect();
    }
  });
}

/**
 * Subscribes to server-sent events.
 *
 * @function on
 * @param {string|function} type - Event type to listen for, or handler for all events
 * @param {function} [handler] - Handler function (if type is a string)
 *
 * @example
 * // Listen for specific event type
 * on('notification', (data) => {
 *     console.log('Notification:', data)
 * })
 *
 * @example
 * // Listen for all events
 * on((event) => {
 *     console.log('Event:', event.type, event.data)
 * })
 */
function on(type, handler) {
  // Support on(handler) syntax for listening to all events
  if (typeof type === "function") {
    handler = type;
    type = null;
  }

  // If connected, register immediately
  if (ready) {
    setOnReceiver(type, handler);
  } else {
    // Otherwise, buffer for when connection opens
    bufferedReceivers.push({ type, handler });

    // Trigger connection if we have a server URL
    if (serverUrl) connect();
  }
}

/**
 * Subscribes to connection state changes.
 *
 * The handler is called immediately with the current state,
 * and then again whenever the state changes.
 *
 * @function onConnectionChange
 * @param {function(string): void} handler - Callback receiving ConnectionState values
 * @returns {function(): void} Unsubscribe function
 *
 * @example
 * const unsubscribe = onConnectionChange((state) => {
 *     console.log('Connection state:', state)
 * })
 *
 * // Later, stop listening
 * unsubscribe()
 */
function onConnectionChange(handler) {
  connectionChangeListeners.push(handler);

  // Immediately invoke with current state
  handler(connectionState);

  // Return unsubscribe function
  return () => {
    const idx = connectionChangeListeners.indexOf(handler);
    if (idx > -1) connectionChangeListeners.splice(idx, 1);
  };
}

/**
 * Checks if the connection is ready to send messages.
 *
 * @function isReady
 * @returns {boolean} True if connected and ready
 */
function isReady() {
  return ready;
}

/**
 * Gets the current WebSocket instance.
 * Useful for advanced use cases like accessing readyState directly.
 *
 * @function getWs
 * @returns {WebSocket|null} The WebSocket instance, or null if not connected
 */
function getWs() {
  return ws;
}

// ============================================================================
// EXPORTS
// ============================================================================

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
  /** Subscribe to server events */
  on,
  /** Subscribe to connection state changes */
  onConnectionChange,
  /** Register a message receiver (internal) */
  setOnReceiver,
  /** Notify connection state change (internal) */
  notifyConnectionChange,
  /** Check if connection is ready */
  isReady,
  /** Get WebSocket instance */
  getWs,
  /** WebSocket constructor (native or polyfill) */
  WebSocket,
};
