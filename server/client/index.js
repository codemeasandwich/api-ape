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
 * This handler intercepts property access and function calls to build
 * API paths dynamically. For example:
 * - `api.users` returns a new proxy with path "/users"
 * - `api.users.list()` calls the "/users/list" endpoint
 * - `api.users("/123").profile()` calls the "/users/123/profile" endpoint
 *
 * @private
 * @type {ProxyHandler}
 */
const handler = {
  /**
   * Intercepts property access on the proxy.
   *
   * - Reserved properties (`on`, `onConnectionChange`, `transport`, `connect`, `close`)
   *   return their actual implementations
   * - `then` and `catch` return undefined to prevent promise coercion
   * - All other properties return a new proxy function that extends the path
   *
   * @param {Object} target - The proxy target
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

    /**
     * Creates a wrapper function that can be called or chained further.
     *
     * When called with two arguments where the first is a string,
     * it appends to the path: `api.users("/123", data)` → path "/users/123"
     *
     * When called with one argument, it uses that as the request body:
     * `api.users.create({ name: 'Alice' })` → POST to "/users/create"
     *
     * @param {string|Object} [a] - Path segment or request body
     * @param {Object} [b] - Request body (when a is a path segment)
     * @returns {Promise} Promise resolving to the server response
     */
    const wrapperFn = function (a, b) {
      let path = joinKey + prop,
        body;

      if (arguments.length === 2 && typeof a === "string") {
        // Two args with string first: append to path
        // e.g., api.users("/123", { name: 'Bob' })
        path += a;
        body = b;
      } else {
        // Single arg: use as body
        // e.g., api.users.create({ name: 'Alice' })
        body = a;
      }

      return queueOrSend(path, body);
    };

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
