/**
 * Browser entry point for api-ape client
 *
 * This module sets up the global `window.api` object for direct browser usage.
 * It is designed to be loaded via a `<script>` tag and automatically establishes
 * a WebSocket connection with automatic reconnection enabled.
 *
 * @module client/browser
 * @file Browser bundle entry point - creates global `window.api` object
 *
 * @description
 * When loaded in a browser environment, this module:
 * 1. Establishes a WebSocket connection to the server
 * 2. Enables automatic reconnection on disconnect
 * 3. Exposes the `window.api` global object for making API calls
 *
 * The `window.api` object is a Proxy that allows calling server endpoints
 * using a fluent, path-building syntax.
 *
 * @example <caption>Loading in HTML</caption>
 * <script src="/api/ape.js"></script>
 * <script>
 *   // The global `api` object is now available
 *   api.users.list().then(users => console.log(users))
 * </script>
 *
 * @example <caption>Making API calls</caption>
 * // Call /users endpoint
 * api.users({ name: 'Alice' })
 *
 * // Call /users/create endpoint
 * api.users.create({ name: 'Bob', email: 'bob@example.com' })
 *
 * // Call /chat/messages endpoint with path parameter
 * api.chat.messages('/room123', { text: 'Hello!' })
 *
 * @example <caption>Subscribing to broadcasts</caption>
 * // Listen for 'notification' broadcasts from the server
 * api.on('notification', (payload) => {
 *   console.log('Received:', payload.data)
 * })
 *
 * @example <caption>Monitoring connection state</caption>
 * api.onConnectionChange((state) => {
 *   console.log('Connection state:', state)
 *   // state: 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
 * })
 *
 * @example <caption>Checking transport type</caption>
 * console.log('Transport:', api.transport) // 'websocket' | 'polling' | null
 *
 * @see {@link module:client/connectSocket} for connection implementation details
 * @see {@link module:client/connection/proxy} for the Proxy-based API syntax
 */

import connectSocket from "./connectSocket.js";

/**
 * The client instance created by connectSocket.
 * Contains the sender proxy, event handlers, and transport information.
 *
 * @type {Object}
 * @property {Proxy} sender - Proxied object for making API calls
 * @property {Function} setOnReceiver - Function to register broadcast handlers
 * @property {Function} onConnectionChange - Function to monitor connection state
 * @property {string|null} transport - Current transport type ('websocket' | 'polling' | null)
 * @private
 */
const client = connectSocket();

/**
 * Enable automatic reconnection when the WebSocket connection is lost.
 * This ensures the client will attempt to reconnect after disconnection.
 */
connectSocket.autoReconnect();

/**
 * Global API object exposed on `window.api`.
 *
 * This is a Proxy object that intercepts property access to build endpoint paths.
 * Each property access returns a new Proxy, allowing chained path building.
 *
 * @global
 * @name api
 * @type {Proxy}
 *
 * @property {Function} on - Subscribe to server broadcasts
 * @property {Function} onConnectionChange - Subscribe to connection state changes
 * @property {string|null} transport - Current transport type (read-only)
 *
 * @example
 * // These are equivalent:
 * api.users({ id: 1 })           // Calls /users
 * api.users.profile({ id: 1 })   // Calls /users/profile
 */
window.api = client.sender;

/**
 * Register a handler for server broadcasts.
 *
 * @function api.on
 * @param {string} type - The broadcast type/event name to listen for
 * @param {Function} handler - Callback function invoked when broadcast is received
 * @param {Object} handler.payload - The broadcast payload
 * @param {*} handler.payload.data - The broadcast data
 * @param {string} handler.payload.type - The broadcast type
 * @param {Error|null} handler.payload.err - Error if any occurred
 *
 * @example
 * api.on('chat.message', ({ data, type }) => {
 *   console.log(`New message: ${data.text}`)
 * })
 *
 * @example
 * api.on('user.joined', ({ data }) => {
 *   showNotification(`${data.username} joined the room`)
 * })
 */
Object.defineProperty(window.api, "on", {
  value: client.setOnReceiver,
  writable: false,
  enumerable: false,
  configurable: false,
});

/**
 * Subscribe to connection state changes.
 *
 * The handler is called immediately with the current state and then
 * again whenever the connection state changes.
 *
 * @function api.onConnectionChange
 * @param {Function} handler - Callback invoked on state changes
 * @param {ConnectionState} handler.state - The new connection state
 * @returns {Function} Unsubscribe function to stop receiving updates
 *
 * @example
 * const unsubscribe = api.onConnectionChange((state) => {
 *   switch (state) {
 *     case 'connected':
 *       hideOfflineBanner()
 *       break
 *     case 'disconnected':
 *     case 'offline':
 *       showOfflineBanner()
 *       break
 *     case 'walled':
 *       showCaptivePortalWarning()
 *       break
 *   }
 * })
 *
 * // Later, to stop listening:
 * unsubscribe()
 */
Object.defineProperty(window.api, "onConnectionChange", {
  value: client.onConnectionChange,
  writable: false,
  enumerable: false,
  configurable: false,
});

/**
 * Current transport type (read-only).
 *
 * Indicates which transport mechanism is currently being used for communication:
 * - `'websocket'` - Primary WebSocket connection is active
 * - `'polling'` - Fallback HTTP streaming/long-polling is active
 * - `null` - No connection established yet
 *
 * This property is read-only and managed internally by api-ape.
 * The transport may change during the lifecycle of the connection
 * (e.g., falling back from WebSocket to polling if WS is blocked).
 *
 * @name api.transport
 * @type {string|null}
 * @readonly
 *
 * @example
 * console.log('Current transport:', api.transport)
 * // Output: 'websocket', 'polling', or null
 *
 * @example
 * if (api.transport === 'polling') {
 *   console.warn('WebSocket unavailable, using fallback transport')
 * }
 */
Object.defineProperty(window.api, "transport", {
  get: () => client.transport,
  enumerable: false,
  configurable: false,
});
