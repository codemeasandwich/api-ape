/**
 * @fileoverview api-ape Server Entry Point
 *
 * This is the main entry point for the api-ape framework. It provides a unified
 * interface for both server setup and client API calls, with intelligent detection
 * of the intended usage mode.
 *
 * ## Dual-Purpose Design
 *
 * The `ape` function serves two purposes:
 * 1. **Server Setup**: When called with an HTTP server, it initializes WebSocket handling
 * 2. **API Call**: When called with data, it makes an API call to the `/ape` endpoint
 *
 * This design allows the same import to be used for both server-side setup
 * and making API calls from Node.js code.
 *
 * ## Usage Patterns
 *
 * ### CommonJS
 * ```javascript
 * const api = require('api-ape')           // Get client proxy (default export)
 * const { ape } = require('api-ape')       // Get server/API function
 *
 * // Server setup (first arg is HTTP server)
 * ape(httpServer, { where: 'api' })
 *
 * // API call (first arg is data)
 * api.users({ action: 'list' })
 * ```
 *
 * ### ES Modules
 * ```javascript
 * import api, { ape } from 'api-ape'
 *
 * // Same usage as CommonJS
 * ```
 *
 * ## Server Detection
 *
 * The `ape` function detects HTTP servers by checking for:
 * - `.listen()` method (http.Server)
 * - `.on()` method (EventEmitter)
 * - `.address()` method (bound server)
 *
 * If none of these are present, the call is treated as an API request.
 *
 * ## Exports
 *
 * | Export      | Type     | Description                              |
 * |-------------|----------|------------------------------------------|
 * | `default`   | Proxy    | Client API proxy for making calls        |
 * | `ape`       | Function | Server setup or API call to /ape         |
 * | `api`       | Proxy    | Same as default export                   |
 * | `broadcast` | Function | Send message to all connected clients    |
 * | `publish`   | Function | Send message to channel subscribers      |
 * | `clients`   | Map      | Read-only map of connected clients       |
 *
 * @module server/index
 * @see {@link module:server/lib/main} for server initialization
 * @see {@link module:server/lib/broadcast} for broadcast functionality
 * @see {@link module:server/client} for Node.js client API
 *
 * @example <caption>Basic Server Setup</caption>
 * const http = require('http')
 * const { ape } = require('api-ape')
 *
 * const server = http.createServer((req, res) => {
 *   res.end('Hello World')
 * })
 *
 * // Initialize api-ape with your API directory
 * ape(server, { where: 'api' })
 *
 * server.listen(3000, () => {
 *   console.log('Server running on port 3000')
 * })
 *
 * @example <caption>Express Integration</caption>
 * const express = require('express')
 * const { ape } = require('api-ape')
 *
 * const app = express()
 * const server = app.listen(3000)
 *
 * ape(server, {
 *   where: 'api',
 *   onConnect: (socket, req, send) => {
 *     console.log('Client connected')
 *     return {
 *       embed: { userId: getUserId(req) },
 *       onDisconnect: () => console.log('Client disconnected')
 *     }
 *   }
 * })
 *
 * @example <caption>Broadcasting to Clients</caption>
 * const { ape, broadcast, clients } = require('api-ape')
 *
 * // Broadcast to all connected clients
 * broadcast('notification', { message: 'Server update!' })
 *
 * // Broadcast to all except sender
 * broadcast('chat', { text: 'Hello' }, excludeClientId)
 *
 * // Check connected clients
 * console.log(`${clients.size} clients connected`)
 *
 * @example <caption>Making API Calls from Node.js</caption>
 * const api = require('api-ape')
 *
 * // Configure connection (if not on same server)
 * api.connect('localhost', 3000)
 *
 * // Make API calls
 * const users = await api.users.list()
 * const result = await api.chat({ message: 'Hello!' })
 */

const serverApe = require("./lib/main");
const { broadcast, clients, publish } = require("./lib/broadcast");
const api = require("./client");
const { _queueOrSend } = require("./client");

/**
 * Attach broadcast utilities to the serverApe function for convenience access
 *
 * This allows users to access broadcast functionality directly from the
 * server setup function: `ape.broadcast('type', data)`
 *
 * @private
 */
serverApe.broadcast = broadcast;
serverApe.clients = clients;
serverApe.publish = publish;

/**
 * Check if a value looks like an HTTP server instance
 *
 * Detects HTTP servers by checking for common server methods.
 * This heuristic works for:
 * - Node.js http.Server
 * - Express app.listen() result
 * - Koa server
 * - Fastify server
 * - Bun.serve() result
 *
 * @param {any} val - Value to check
 * @returns {boolean} True if the value appears to be an HTTP server
 * @private
 *
 * @example
 * isHttpServer(http.createServer())     // true
 * isHttpServer(app.listen(3000))        // true (Express)
 * isHttpServer({ data: 'payload' })     // false
 * isHttpServer(null)                    // false
 */
function isHttpServer(val) {
  return (
    val &&
    typeof val === "object" &&
    (typeof val.listen === "function" ||
      typeof val.on === "function" ||
      typeof val.address === "function")
  );
}

/**
 * Dual-purpose ape function for server setup or API calls
 *
 * This function intelligently detects its intended use:
 *
 * ## Server Setup Mode
 * When the first argument is an HTTP server, initializes api-ape:
 * - Sets up WebSocket handling on the server
 * - Loads controllers from the specified directory
 * - Configures connection lifecycle callbacks
 * - Enables file transfer handling
 *
 * ## API Call Mode
 * When the first argument is not a server, makes an API call:
 * - Sends the data to the `/ape` endpoint
 * - Returns a Promise that resolves with the response
 *
 * @param {http.Server|Object|any} firstArg - HTTP server for setup, or data for API call
 * @param {...any} rest - Additional arguments (options for server setup)
 * @returns {Object|Promise<any>} Server info object (setup mode) or response Promise (API mode)
 *
 * @example <caption>Server Setup</caption>
 * const server = http.createServer()
 *
 * ape(server, {
 *   where: 'api',                    // Directory containing API controllers
 *   onConnect: (socket, req, send) => ({
 *     embed: { userId: '123' },      // Values available in all controllers
 *     onReceive: (queryId, data, type) => { },
 *     onSend: (data, type) => { },
 *     onError: (errString) => { },
 *     onDisconnect: () => { }
 *   }),
 *   fileTransferOptions: {
 *     startTimeout: 60000,           // Timeout before upload starts
 *     completeTimeout: 60000         // Timeout for upload completion
 *   }
 * })
 *
 * @example <caption>API Call</caption>
 * // Calls the /ape endpoint with the provided data
 * const result = await ape({ action: 'ping' })
 */
function ape(firstArg, ...rest) {
  if (isHttpServer(firstArg)) {
    // Server setup mode
    return serverApe(firstArg, ...rest);
  }
  // API call mode - directly call the internal queueOrSend
  return _queueOrSend("/ape", firstArg);
}

/**
 * Broadcast a message to all connected clients
 *
 * Sends a message of the specified type to every connected WebSocket client.
 * Optionally excludes a specific client (useful for not echoing back to sender).
 *
 * @function broadcast
 * @param {string} type - Message type identifier
 * @param {any} data - Data payload to send
 * @param {string} [excludeClientId] - Optional client ID to exclude from broadcast
 *
 * @example
 * // Broadcast to everyone
 * ape.broadcast('announcement', { text: 'Server restarting in 5 minutes' })
 *
 * // Broadcast to everyone except the sender
 * ape.broadcast('chat', { user: 'Alice', message: 'Hello!' }, senderClientId)
 */
ape.broadcast = broadcast;

/**
 * Publish a message to all subscribers of a channel
 *
 * Sends a message to all clients subscribed to the specified channel.
 * Also caches the message so new subscribers receive it immediately.
 *
 * @function publish
 * @param {string} channel - Channel name (e.g., '/health', '/stock/AAPL')
 * @param {any} data - Data payload to send
 *
 * @example
 * // Publish to a channel
 * ape.publish('/health', { status: 'ok', uptime: process.uptime() })
 *
 * // Clients subscribed to '/health' will receive:
 * // { type: '/health', data: { status: 'ok', uptime: 12345 } }
 */
ape.publish = publish;

/**
 * Read-only Map of connected clients
 *
 * Provides access to all currently connected clients. Each client entry
 * includes methods for sending messages and accessing client metadata.
 *
 * The Map is read-only - attempts to modify it will throw an error.
 * Client connections are managed internally by api-ape.
 *
 * @type {Map<string, ClientWrapper>}
 *
 * @property {number} size - Number of connected clients
 *
 * @example
 * // Check number of connected clients
 * console.log(`${ape.clients.size} clients online`)
 *
 * // Iterate over clients
 * ape.clients.forEach((client, clientId) => {
 *   console.log(`Client ${clientId}: ${client.agent.browser?.name}`)
 * })
 *
 * // Send to specific client
 * const client = ape.clients.get(clientId)
 * if (client) {
 *   client.sendTo('notification', { message: 'Hello!' })
 * }
 *
 * // Access client properties
 * for (const client of ape.clients.values()) {
 *   console.log({
 *     clientId: client.clientId,
 *     sessionId: client.sessionId,
 *     embed: client.embed,
 *     agent: client.agent
 *   })
 * }
 */
ape.clients = clients;

/**
 * Store reference to original serverApe for direct access if needed
 *
 * This is primarily for internal use or advanced scenarios where
 * direct access to the server initialization function is required.
 *
 * @type {Function}
 * @private
 */
ape._serverApe = serverApe;

/**
 * Define ape on the proxy's target so it can be destructured
 *
 * The proxy handler checks Reflect.has first, so this property
 * will be found when destructuring: `const { ape } = require('api-ape')`
 *
 * @private
 */
Object.defineProperty(api, "ape", {
  value: ape,
  writable: false,
  enumerable: true,
  configurable: false,
});

/**
 * Default export: the client API proxy
 *
 * This allows the common pattern: `const api = require('api-ape')`
 * The proxy intercepts property access to build API endpoint paths.
 *
 * @type {Proxy}
 *
 * @example
 * const api = require('api-ape')
 *
 * // These are equivalent:
 * api.users({ action: 'list' })     // Calls /users
 * api.users.profile({ id: 1 })      // Calls /users/profile
 * api.chat('/room1', { msg: 'Hi' }) // Calls /chat/room1
 */
module.exports = api;

/**
 * Named exports for ES Module compatibility and destructuring
 *
 * @example
 * // CommonJS destructuring
 * const { ape, broadcast, clients } = require('api-ape')
 *
 * // ES Modules
 * import api, { ape, broadcast, clients } from 'api-ape'
 */
module.exports.ape = ape;
module.exports.api = api;
module.exports.broadcast = broadcast;
module.exports.publish = publish;
module.exports.clients = clients;
module.exports.default = api;
