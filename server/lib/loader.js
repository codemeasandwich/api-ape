/**
 * @fileoverview Controller Loader for api-ape Server
 *
 * This module provides the functionality to automatically load API controller
 * files from a directory structure. Controllers are JavaScript files that
 * export functions to handle specific API endpoints.
 *
 * ## How It Works
 *
 * The loader recursively scans a directory and loads all JavaScript files,
 * mapping their file paths to endpoint names:
 *
 * ```
 * Directory Structure:           Endpoint Mapping:
 * ─────────────────────          ─────────────────
 * api/
 * ├── users.js            →     controllers['users']
 * ├── users/
 * │   ├── profile.js      →     controllers['users/profile']
 * │   └── settings.js     →     controllers['users/settings']
 * ├── chat.js             →     controllers['chat']
 * └── admin/
 *     └── dashboard.js    →     controllers['admin/dashboard']
 * ```
 *
 * ## Controller File Format
 *
 * Each controller file should export a function (sync or async) that handles
 * requests to that endpoint:
 *
 * ```javascript
 * // api/users.js
 * module.exports = async function(data) {
 *   // `this` contains embed values from onConnect
 *   const { userId, permissions } = this
 *
 *   // `data` is the payload sent by the client
 *   const { action, query } = data
 *
 *   // Return value is sent back to client
 *   return await db.users.find(query)
 * }
 * ```
 *
 * ## Index Files
 *
 * Files named `index.js` are mapped to their parent directory:
 * - `api/users/index.js` → `controllers['users']`
 *
 * ## Duplicate Detection
 *
 * The loader detects duplicate endpoints and throws an error:
 * - `api/users.js` and `api/users/index.js` would both map to 'users'
 * - This is caught and reported with both file paths
 *
 * @module server/lib/loader
 * @see {@link module:server/utils/deepRequire} for the underlying loader implementation
 * @see {@link module:server/lib/main} for how controllers are used
 *
 * @example <caption>Basic Usage</caption>
 * const loader = require('./loader')
 *
 * // Load all controllers from ./api directory
 * const controllers = loader('api')
 *
 * // controllers = {
 * //   'users': [Function],
 * //   'users/profile': [Function],
 * //   'chat': [Function],
 * //   'admin/dashboard': [Function]
 * // }
 *
 * @example <caption>Calling a Controller</caption>
 * const controllers = loader('api')
 *
 * // This is how api-ape invokes controllers internally
 * const handler = controllers['users']
 * const context = { userId: 123, permissions: ['read'] }
 * const result = await handler.call(context, { action: 'list' })
 *
 * @example <caption>Controller Implementation</caption>
 * // api/messages.js
 * module.exports = async function(data) {
 *   // Available context via `this`:
 *   // - this.clientId     - Unique client identifier
 *   // - this.sessionId    - Session ID from cookies
 *   // - this.req          - Original HTTP request (WebSocket upgrade)
 *   // - this.send         - Function to send messages to this client
 *   // - this.broadcast    - Function to broadcast to all clients
 *   // - this.broadcastOthers - Broadcast excluding this client
 *   // - this.clients      - Map of all connected clients
 *   // - ...embed values   - Custom values from onConnect
 *
 *   const { roomId, text } = data
 *
 *   // Save to database
 *   const message = await db.messages.create({
 *     roomId,
 *     text,
 *     userId: this.userId,  // From embed
 *     createdAt: new Date()
 *   })
 *
 *   // Broadcast to other users in the room
 *   this.broadcastOthers('new-message', {
 *     roomId,
 *     message
 *   })
 *
 *   return message
 * }
 *
 * @example <caption>Nested Routes</caption>
 * // api/admin/users/ban.js → endpoint: 'admin/users/ban'
 * module.exports = async function({ userId, reason }) {
 *   // Check admin permissions
 *   if (!this.permissions?.includes('admin')) {
 *     throw new Error('Permission denied')
 *   }
 *
 *   await db.users.ban(userId, reason)
 *   return { success: true }
 * }
 */

const deeprequire = require("../utils/deepRequire");
const path = require("path");

/**
 * Current working directory where Node.js was started
 *
 * This ensures that the 'where' folder path is resolved relative to
 * the application root, not relative to this module's location.
 *
 * @constant {string}
 * @private
 */
const currentDir = process.cwd();

/**
 * Load all controller files from a directory
 *
 * Recursively scans the specified directory for JavaScript files and
 * loads them as controller functions. Each file's path (relative to the
 * directory) becomes its endpoint name.
 *
 * ## Path Resolution
 *
 * The `dirname` parameter is resolved relative to `process.cwd()` (where
 * Node.js was started), not relative to this module. This allows the
 * calling application to specify paths relative to its own root.
 *
 * ## File Selection
 *
 * By default, all `.js` files are loaded. Use the optional `selector`
 * parameter to customize which files are included.
 *
 * ## Error Handling
 *
 * - Throws if `dirname` doesn't exist
 * - Throws if duplicate endpoints are detected (e.g., `users.js` and `users/index.js`)
 * - Throws if a controller file has syntax errors
 *
 * @param {string} dirname - Directory name relative to current working directory
 *                           (e.g., 'api', 'controllers', 'src/api')
 * @param {string[]} [selector=['js']] - File extensions to include (without dots)
 * @returns {Object.<string, Function>} Object mapping endpoint paths to controller functions
 * @throws {Error} If directory doesn't exist or contains duplicate endpoints
 *
 * @example
 * // Load from ./api directory
 * const controllers = loader('api')
 *
 * @example
 * // Load from nested directory
 * const controllers = loader('src/api/v1')
 *
 * @example
 * // Custom file extension selector
 * const controllers = loader('api', ['js', 'mjs'])
 *
 * @example
 * // Resulting controller object structure
 * const controllers = loader('api')
 * // {
 * //   'users': function(data) { ... },
 * //   'users/profile': function(data) { ... },
 * //   'users/settings': function(data) { ... },
 * //   'chat': function(data) { ... },
 * //   'chat/rooms': function(data) { ... },
 * //   'admin/stats': function(data) { ... }
 * // }
 *
 * @example
 * // Manual controller invocation (internal use)
 * const controllers = loader('api')
 *
 * async function handleRequest(endpoint, data, context) {
 *   const handler = controllers[endpoint.toLowerCase()]
 *
 *   if (!handler) {
 *     throw new Error(`Endpoint not found: ${endpoint}`)
 *   }
 *
 *   // Call with context bound to `this`
 *   return await handler.call(context, data)
 * }
 */
module.exports = function (dirname, selector) {
  return deeprequire(path.join(currentDir, dirname), selector);
};
