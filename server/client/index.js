/**
 * @fileoverview api-ape Node.js Client - Server-Side WebSocket Client
 *
 * This module provides a Node.js client for connecting to an api-ape server.
 * It mirrors the browser client API exactly, allowing server-to-server communication
 * or backend services to connect to api-ape servers.
 *
 * The client uses a Proxy-based API that allows natural method chaining
 * for constructing API paths. Any property access on the client becomes
 * part of the request path.
 *
 * Features:
 * - **Proxy-based API**: Natural method chaining (`api.users.list()`)
 * - **Auto-reconnect**: Automatically reconnects on connection loss
 * - **Connection state tracking**: Subscribe to connection state changes
 * - **Request queuing**: Requests made while disconnected are queued
 * - **Promise-based**: All API calls return promises
 *
 * @module server/client
 * @see {@link module:server/client/connection} - Connection management implementation
 * @see {@link module:client/index} - Browser client (same API)
 *
 * @example
 * // Basic usage
 * const api = require('api-ape/server/client')
 *
 * // Connect to an api-ape server
 * api.connect('localhost', 3000)
 *
 * // Make API calls using natural method chaining
 * const users = await api.users.list()
 * const user = await api.users.get({ id: '123' })
 *
 * // Subscribe to connection state changes
 * api.onConnectionChange(state => {
 *     console.log('Connection state:', state)
 * })
 *
 * // Subscribe to server-sent events
 * api.on('notification', data => {
 *     console.log('Notification received:', data)
 * })
 *
 * @example
 * // Using with environment variables
 * process.env.APE_SERVER = 'ws://localhost:3000/api/ape'
 * const api = require('api-ape/server/client')
 * api.connect() // Uses APE_SERVER environment variable
 *
 * @example
 * // Clean shutdown
 * process.on('SIGTERM', () => {
 *     api.close()
 *     process.exit(0)
 * })
 */

const {
  ConnectionState,
  connect,
  close,
  queueOrSend,
  on,
  onConnectionChange,
  isReady,
} = require("./connection");

/**
 * Path separator used when building API paths.
 * @private
 * @constant {string}
 */
const joinKey = "/";

/**
 * Proxy handler for the api-ape client.
 *
 * Each `get` extends an accumulated `_path` stored on the wrapper. The
 * call itself takes one argument only — a callback to subscribe, or a
 * payload to RPC. Dynamic segments are expressed via bracket access
 * (`api.users[id](body)`), never as a string argument to the call.
 *
 * @private
 * @type {ProxyHandler}
 */
const handler = {
  /**
   * Intercepts property access on the proxy.
   *
   * - Reserved properties (`on`, `onConnectionChange`, `transport`,
   *   `connect`, `close`) return their actual implementations
   * - `then` and `catch` return undefined to prevent promise coercion
   * - All other properties return a wrapper function whose `_path`
   *   extends the parent's `_path` by the new segment
   *
   * @param {Object} target - The proxy target (root object or prior wrapper)
   * @param {string} prop - The property being accessed
   * @returns {*} The property value or a new proxy
   */
  get(target, prop) {
    // Return actual property if it exists on the target
    if (Reflect.has(target, prop)) return Reflect.get(target, prop);

    // Reserved methods - return actual implementations
    if (prop === "on") return on;
    if (prop === "onConnectionChange") return onConnectionChange;
    if (prop === "transport") return isReady() ? "websocket" : null;
    if (prop === "connect") return connect;
    if (prop === "close") return close;

    // Prevent promise coercion (don't let proxy be awaited directly)
    if (prop === "then" || prop === "catch") return undefined;

    // Symbols and other non-strings must not extend the path. Returning
    // the raw target property keeps the proxy compatible with iteration
    // and the thenable protocol.
    if (typeof prop !== "string") return target[prop];

    // Accumulate path on this wrapper. The root target has no `_path`
    // so its first child segment starts at "/<prop>".
    const path = (target._path || "") + joinKey + prop;

    /**
     * Dispatch function for the wrapped node.
     *
     * - With a single function argument → subscribe to `path` via on(),
     *   stripping the websocket envelope so callers see `event.data` only.
     * - Otherwise → send an RPC at `path` with the argument as body
     *   (which may be undefined).
     *
     * @param {Object|Function} [payload] - RPC body or subscription callback
     * @returns {Promise|Function} Promise of the response, or unsubscribe function
     */
    const wrapperFn = function (payload) {
      if (typeof payload === "function") {
        /**
         * Adapter that strips the websocket envelope so the user callback
         * receives only the message payload, not the `{ data }` wrapper
         * emitted by the underlying `on()` subscription.
         *
         * @param {{ data?: unknown }} event - Incoming envelope from on()
         * @returns {void}
         */
        const wrappedHandler = (event) => payload(event.data);
        return on(path, wrappedHandler);
      }
      return queueOrSend(path, payload);
    };

    // Store accumulated path so the next `get` can extend it.
    wrapperFn._path = path;

    // Return a new proxy wrapping the function, allowing further chaining
    return new Proxy(wrapperFn, handler);
  },
};

/**
 * The api-ape client proxy object.
 *
 * This is the main export of the module. It's a Proxy that allows
 * natural method chaining for API calls.
 *
 * @type {Proxy}
 *
 * @property {function} on - Subscribe to server events
 * @property {function} onConnectionChange - Subscribe to connection state changes
 * @property {string|null} transport - Current transport type ('websocket' or null)
 * @property {function} connect - Establish connection to server
 * @property {function} close - Close the connection
 *
 * @example
 * // The proxy allows any property access to become an API path
 * api.users.list()           // Calls /users/list
 * api.posts.comments.recent() // Calls /posts/comments/recent
 * api.auth.login({ user, pass }) // Calls /auth/login with body
 */
const api = new Proxy({}, handler);

// Define non-enumerable properties for reserved methods
// This ensures they can't be overwritten and don't show in Object.keys()

/**
 * Subscribe to server-sent events of a specific type.
 *
 * @function on
 * @memberof module:server/client
 * @param {string|null} type - Event type to listen for, or null for all events
 * @param {function} handler - Callback function receiving event data
 *
 * @example
 * // Listen for specific event type
 * api.on('notification', (data) => {
 *     console.log('Notification:', data)
 * })
 *
 * @example
 * // Listen for all events
 * api.on(null, (event) => {
 *     console.log('Event:', event.type, event.data)
 * })
 */
Object.defineProperty(api, "on", {
  value: on,
  writable: false,
  enumerable: false,
  configurable: false,
});

/**
 * Subscribe to connection state changes.
 *
 * @function onConnectionChange
 * @memberof module:server/client
 * @param {function} handler - Callback receiving the new ConnectionState
 * @returns {function} Unsubscribe function
 *
 * @example
 * const unsubscribe = api.onConnectionChange((state) => {
 *     switch (state) {
 *         case 'connected':
 *             console.log('Connected to server')
 *             break
 *         case 'disconnected':
 *             console.log('Disconnected from server')
 *             break
 *     }
 * })
 *
 * // Later, stop listening
 * unsubscribe()
 */
Object.defineProperty(api, "onConnectionChange", {
  value: onConnectionChange,
  writable: false,
  enumerable: false,
  configurable: false,
});

/**
 * Establish a connection to an api-ape server.
 *
 * @function connect
 * @memberof module:server/client
 * @param {string} [host] - Server hostname
 * @param {number} [port] - Server port
 *
 * @example
 * // Connect with explicit host and port
 * api.connect('localhost', 3000)
 *
 * @example
 * // Connect using APE_SERVER environment variable
 * process.env.APE_SERVER = 'ws://api.example.com/api/ape'
 * api.connect()
 */
Object.defineProperty(api, "connect", {
  value: connect,
  writable: false,
  enumerable: false,
  configurable: false,
});

/**
 * Close the WebSocket connection.
 * Disables auto-reconnect until connect() is called again.
 *
 * @function close
 * @memberof module:server/client
 *
 * @example
 * // Clean shutdown
 * process.on('SIGTERM', () => {
 *     api.close()
 *     process.exit(0)
 * })
 */
Object.defineProperty(api, "close", {
  value: close,
  writable: false,
  enumerable: false,
  configurable: false,
});

// Module exports

/**
 * Default export - the api-ape client proxy
 * @type {Proxy}
 */
module.exports = api;

/**
 * Default export (for ES module interop)
 * @type {Proxy}
 */
module.exports.default = api;

/**
 * Subscribe to server events
 * @function
 */
module.exports.on = on;

/**
 * Subscribe to connection state changes
 * @function
 */
module.exports.onConnectionChange = onConnectionChange;

/**
 * Establish connection to server
 * @function
 */
module.exports.connect = connect;

/**
 * Configure api-ape internal logging for the Node.js client (same as browser).
 * @function
 */
module.exports.configureLogging =
  require("./connection").configureApeLogging;

/**
 * Close the connection
 * @function
 */
module.exports.close = close;

/**
 * Connection state enumeration.
 *
 * @type {Object}
 * @property {string} Disconnected - Not connected to server
 * @property {string} Connecting - Connection attempt in progress
 * @property {string} Connected - Successfully connected
 * @property {string} Closing - Connection is being closed
 *
 * @example
 * const { ConnectionState } = require('api-ape/server/client')
 *
 * api.onConnectionChange((state) => {
 *     if (state === ConnectionState.Connected) {
 *         console.log('Ready to make API calls')
 *     }
 * })
 */
module.exports.ConnectionState = ConnectionState;

/**
 * Internal function for queuing or sending requests.
 * Exposed for advanced use cases and testing.
 *
 * @private
 * @function
 */
module.exports._queueOrSend = queueOrSend;
