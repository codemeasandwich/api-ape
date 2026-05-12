/**
 * @fileoverview Main api-ape Server Entry Point
 *
 * This module provides the unified entry point for initializing api-ape on any
 * supported server platform. It handles runtime detection, WebSocket setup,
 * controller loading, and HTTP endpoint configuration.
 *
 * ## Supported Runtimes
 *
 * | Runtime   | WebSocket Provider        | Notes                        |
 * |-----------|---------------------------|------------------------------|
 * | Node.js   | Polyfill or native (v24+) | Full feature support         |
 * | Bun       | Native Bun WebSocket      | High performance             |
 * | Deno      | Native Deno WebSocket     | Via adapter                  |
 *
 * ## Initialization Flow
 *
 * ```
 * ape(server, options)
 *       │
 *       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  createApeCore(options)                             │
 * │  ├── Load controllers from 'where' directory       │
 * │  ├── Initialize file transfer manager              │
 * │  ├── Create WebSocket wiring handler               │
 * │  └── Create HTTP long-polling handlers             │
 * └─────────────────────────────────────────────────────┘
 *       │
 *       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  Detect Server Type                                │
 * │  ├── Bun.serve() server → initBunServerWithReload  │
 * │  └── Node.js http.Server → initNodeServer          │
 * └─────────────────────────────────────────────────────┘
 *       │
 *       ▼
 * ┌─────────────────────────────────────────────────────┐
 * │  Server Running                                    │
 * │  ├── WebSocket: /api/ape (or custom path)          │
 * │  ├── Long-poll: /api/ape/poll                      │
 * │  ├── Ping: /api/ape/ping                           │
 * │  ├── Client bundle: /api/ape.js                    │
 * │  └── File transfer: /api/ape/data/:hash            │
 * └─────────────────────────────────────────────────────┘
 * ```
 *
 * ## HTTP Endpoints Created
 *
 * | Endpoint                    | Method | Description                    |
 * |-----------------------------|--------|--------------------------------|
 * | `/{where}/ape`              | WS     | WebSocket connection endpoint  |
 * | `/{where}/ape/poll`         | GET    | HTTP streaming (long-poll)     |
 * | `/{where}/ape/poll`         | POST   | Send message via HTTP          |
 * | `/{where}/ape/ping`         | GET    | Connection health check        |
 * | `/{where}/ape.js`           | GET    | Client JavaScript bundle       |
 * | `/{where}/ape.js.map`       | GET    | Source map for debugging       |
 * | `/{where}/ape/data/:hash`   | GET    | Download binary data           |
 * | `/{where}/ape/data/:qid/:h` | PUT    | Upload binary data             |
 *
 * @module server/lib/main
 * @see {@link module:server/lib/wiring} for WebSocket connection handling
 * @see {@link module:server/lib/loader} for controller loading
 * @see {@link module:server/lib/longPolling} for HTTP fallback
 *
 * @example <caption>Basic Node.js Setup</caption>
 * const http = require('http')
 * const ape = require('api-ape/server/lib/main')
 *
 * const server = http.createServer()
 *
 * ape(server, {
 *   where: 'api',  // Load controllers from ./api directory
 *   onConnect: (socket, req, send) => ({
 *     embed: { userId: getUserFromRequest(req) }
 *   })
 * })
 *
 * server.listen(3000)
 *
 * @example <caption>Express Integration</caption>
 * const express = require('express')
 * const ape = require('api-ape/server/lib/main')
 *
 * const app = express()
 * const server = app.listen(3000)
 *
 * ape(server, {
 *   where: 'api',
 *   onConnect: async (socket, req, send) => {
 *     const session = await validateSession(req)
 *     return {
 *       embed: { user: session.user, permissions: session.permissions },
 *       onDisconnect: () => logDisconnect(session.user)
 *     }
 *   }
 * })
 *
 * @example <caption>Bun Server</caption>
 * const ape = require('api-ape/server/lib/main')
 *
 * const server = Bun.serve({
 *   port: 3000,
 *   fetch(req) { return new Response('Hello') },
 *   websocket: { message() {} }  // Required for api-ape
 * })
 *
 * ape(server, { where: 'api' })
 */

const { configureApeLogging, resetApeLoggingForTesting } = require("../../utils/apeLogger");
const loader = require("./loader");
const wiring = require("./wiring");
const { isBun, isDeno, getRuntime } = require("./wsProvider");
const { getFileTransferManager } = require("./fileTransfer");
const { createLongPollingHandler } = require("./longPolling");
const { initNodeServer } = require("./runtimes/node");
const { isBunServer, initBunServerWithReload } = require("./runtimes/bun");

/**
 * Flag to track whether api-ape has been initialized
 *
 * Prevents multiple initializations which could cause conflicts
 * with WebSocket handlers and HTTP routes.
 *
 * @type {boolean}
 * @private
 */
let created = false;

/**
 * Reset the singleton state for testing purposes.
 * This allows creating multiple server instances in test environments.
 *
 * @private
 * @function _resetForTesting
 */
function _resetForTesting() {
  created = false;
  resetApeLoggingForTesting();
}

/**
 * Create the core api-ape handlers shared between all runtimes
 *
 * This function initializes the components needed regardless of the
 * server runtime (Node.js, Bun, Deno):
 * - Controller loading from the specified directory
 * - File transfer manager for binary data
 * - WebSocket message handler (wiring)
 * - HTTP long-polling handlers for fallback transport
 * - URL path patterns for all endpoints
 *
 * @param {Object} options - Configuration options
 * @param {string} options.where - Directory containing API controllers (relative to CWD)
 * @param {Function} [options.onConnect] - Connection lifecycle callback
 * @param {Object} [options.fileTransferOptions] - File transfer configuration
 * @param {number} [options.fileTransferOptions.startTimeout=60000] - Timeout before upload starts
 * @param {number} [options.fileTransferOptions.completeTimeout=60000] - Timeout for upload completion
 * @param {Object} [options.longPollingOptions] - Long polling configuration
 * @param {number} [options.longPollingOptions.heartbeatInterval=20000] - Interval in ms for heartbeat pings
 * @param {number} [options.longPollingOptions.recycleTimeout=25000] - Timeout in ms before recycling connection
 * @returns {ApeCore} Core handlers and path patterns
 *
 * @typedef {Object} ApeCore
 * @property {Object} controllers - Loaded controller functions keyed by endpoint path
 * @property {FileTransferManager} fileTransfer - Binary data transfer manager
 * @property {Function} wiringHandler - WebSocket connection handler
 * @property {Function} handleStreamGet - HTTP GET handler for long-polling
 * @property {Function} handleStreamPost - HTTP POST handler for sending messages
 * @property {string} wsPath - WebSocket endpoint path (e.g., '/api/ape')
 * @property {string} pollPath - Long-polling endpoint path
 * @property {string} pingPath - Health check endpoint path
 * @property {string} clientPath - Client bundle endpoint path
 * @property {string} clientMapPath - Source map endpoint path
 * @property {string} downloadPattern - Binary download URL pattern
 * @property {string} uploadPattern - Binary upload URL pattern
 *
 * @private
 *
 * @example
 * const core = createApeCore({
 *   where: 'api',
 *   onConnect: myConnectHandler,
 *   fileTransferOptions: { startTimeout: 30000 }
 * })
 *
 * // core.controllers = { 'users': [Function], 'chat': [Function], ... }
 * // core.wsPath = '/api/ape'
 */
function createApeCore({
  where,
  urlPrefix,
  onConnect,
  fileTransferOptions,
  longPollingOptions,
}) {
  const path = require("path");
  // `where` may be absolute (passed verbatim) or relative (joined with cwd
  // for back-compat — this matches the legacy loader resolution semantics).
  // `controllersDir` is exposed for callers that need the resolved on-disk
  // root (e.g. file watchers); keep both branches.
  const controllersDir = path.isAbsolute(where)
    ? where
    : path.join(process.cwd(), where);
  const controllers = loader(where);
  // Decouple the public URL prefix from the on-disk path. Default rules:
  //   absolute `where` → basename (so `/srv/app/api` URL-collapses to `api`)
  //   relative `where` → as-is (preserves the historical `/api/ape` etc.)
  // Explicit `urlPrefix` overrides both. Leading/trailing slashes stripped
  // so callers can pass `/api/`, `api`, or `/api` interchangeably.
  const publicPrefix = urlPrefix
    ? urlPrefix.replace(/^\/+|\/+$/g, "")
    : path.isAbsolute(where)
      ? path.basename(where)
      : where.replace(/^\.?\/+|\/+$/g, "");
  const fileTransfer = getFileTransferManager(fileTransferOptions);
  const wiringHandler = wiring(controllers, onConnect, fileTransfer);
  const { handleStreamGet, handleStreamPost } = createLongPollingHandler(
    controllers,
    onConnect,
    fileTransfer,
    longPollingOptions,
  );

  return {
    controllers,
    controllersDir,
    publicPrefix,
    fileTransfer,
    wiringHandler,
    handleStreamGet,
    handleStreamPost,
    wsPath: `/${publicPrefix}/ape`,
    pollPath: `/${publicPrefix}/ape/poll`,
    pingPath: `/${publicPrefix}/ape/ping`,
    clientPath: `/${publicPrefix}/ape.js`,
    clientMapPath: `/${publicPrefix}/ape.js.map`,
    downloadPattern: `/${publicPrefix}/ape/data/:hash`,
    uploadPattern: `/${publicPrefix}/ape/data/:queryId/:pathHash`,
  };
}

/**
 * Initialize api-ape on an HTTP server
 *
 * This is the main entry point for setting up api-ape. It:
 * 1. Validates that api-ape hasn't already been initialized
 * 2. Creates core handlers (controllers, WebSocket, HTTP)
 * 3. Detects the server type (Node.js, Bun)
 * 4. Initializes the appropriate runtime-specific handlers
 *
 * ## Options
 *
 * | Option               | Type     | Description                                |
 * |----------------------|----------|--------------------------------------------|
 * | `where`              | string   | Directory containing API controllers       |
 * | `onConnect`          | Function | Called when a client connects              |
 * | `fileTransferOptions`| Object   | Binary file transfer configuration         |
 * | `transport`          | string   | Force transport: 'websocket' or 'longpolling' |
 * | `logging`            | boolean\|Object | `false` silences api-ape internal logs; object sets custom log/warn/error sinks |
 *
 * ## onConnect Callback
 *
 * The `onConnect` function is called for each new WebSocket connection.
 * It receives `(socket, req, send)` and should return an options object:
 *
 * ```javascript
 * onConnect: (socket, req, send) => ({
 *   embed: { userId: '123' },      // Values available in all controllers as `this`
 *   onReceive: (queryId, data, type) => { },  // Called when message received
 *   onSend: (data, type) => { },              // Called when message sent
 *   onError: (errorString) => { },            // Called on errors
 *   onDisconnect: () => { }                   // Called when client disconnects
 * })
 * ```
 *
 * @param {http.Server|Object} server - HTTP server instance (Node.js or Bun)
 * @param {Object} options - Configuration options
 * @param {string} options.where - Directory containing API controller files
 * @param {Function} [options.onConnect] - Connection lifecycle callback
 * @param {Object} [options.fileTransferOptions] - File transfer settings
 * @param {string} [options.transport] - Force specific transport mode
 * @returns {Object} Server information including WebSocket server instance
 * @throws {Error} If api-ape has already been initialized
 * @throws {Error} If server type is not supported
 *
 * @example <caption>Minimal Setup</caption>
 * const http = require('http')
 * const ape = require('api-ape/server/lib/main')
 *
 * const server = http.createServer()
 * ape(server, { where: 'api' })
 * server.listen(3000)
 *
 * @example <caption>Full Configuration</caption>
 * ape(server, {
 *   where: 'api',
 *
 *   onConnect: async (socket, req, send) => {
 *     // Authenticate user from request
 *     const token = req.headers.cookie?.match(/token=([^;]+)/)?.[1]
 *     const user = await verifyToken(token)
 *
 *     if (!user) {
 *       socket.close(4001, 'Unauthorized')
 *       return null
 *     }
 *
 *     // Send welcome message
 *     send('welcome', { message: `Hello, ${user.name}!` })
 *
 *     return {
 *       embed: {
 *         user,
 *         permissions: user.roles
 *       },
 *       onReceive: (queryId, data, type) => {
 *         console.log(`[${user.name}] ${type}:`, data)
 *       },
 *       onDisconnect: () => {
 *         console.log(`[${user.name}] disconnected`)
 *       }
 *     }
 *   },
 *
 *   fileTransferOptions: {
 *     startTimeout: 30000,
 *     completeTimeout: 120000
 *   }
 * })
 *
 * @example <caption>Controller File Structure</caption>
 * // api/users.js - handles /users endpoint
 * module.exports = async function(data) {
 *   // `this` contains embed values from onConnect
 *   const { user, permissions } = this
 *
 *   if (!permissions.includes('users:read')) {
 *     throw new Error('Permission denied')
 *   }
 *
 *   return await db.users.find(data.query)
 * }
 *
 * // api/users/profile.js - handles /users/profile endpoint
 * module.exports = async function(data) {
 *   return await db.users.findById(this.user.id)
 * }
 */
module.exports = function (server, options) {
  /* istanbul ignore next 3 - would break test isolation to test "already started" */
  if (created) {
    throw new Error("Api-Ape already started");
  }
  created = true;

  configureApeLogging(options && options.logging);

  const core = createApeCore(options);

  // Check for Bun server first
  /* istanbul ignore next 3 - only reachable in Bun runtime */
  if (isBunServer(server)) {
    return initBunServerWithReload(server, options, core);
  }

  // Check for Node.js http.Server (or Express, Koa, etc.)
  // DEAD `if br 1` (false): the public `ape()` entry point at server/index.js
  // pre-filters server arguments via `isHttpServer()` which only allows
  // objects with at least one of .listen, .on, .address, or .reload. A
  // non-conforming server never reaches this point. The throw below is a
  // belt-and-suspenders defense for direct require'rs of this module.
  // To be removed at step 7.
  /* if (server && typeof server.on === "function") */ {
    return initNodeServer(server, options, core);
  }

  /* istanbul ignore next 3 - requires passing invalid server type */
  // eslint-disable-next-line no-unreachable
  throw new Error(
    "Unsupported server type. Expected http.Server (Node.js) or Bun.serve() server.",
  );
};

/**
 * Check if running in Bun runtime
 *
 * Useful for conditional logic based on runtime capabilities.
 *
 * @function isBun
 * @returns {boolean} True if running in Bun
 *
 * @example
 * const { isBun } = require('api-ape/server/lib/main')
 *
 * if (isBun()) {
 *   console.log('Running on Bun - native WebSocket available')
 * }
 */
module.exports.isBun = isBun;

/**
 * Reset singleton state (for testing only)
 * @private
 */
module.exports._resetForTesting = _resetForTesting;

/**
 * Check if running in Deno runtime
 *
 * @function isDeno
 * @returns {boolean} True if running in Deno
 *
 * @example
 * const { isDeno } = require('api-ape/server/lib/main')
 *
 * if (isDeno()) {
 *   console.log('Running on Deno')
 * }
 */
module.exports.isDeno = isDeno;

/**
 * Get the detected runtime type
 *
 * @function getRuntime
 * @returns {'deno'|'bun'|'node'|'unknown'} The detected runtime
 *
 * @example
 * const { getRuntime } = require('api-ape/server/lib/main')
 *
 * console.log(`Running on: ${getRuntime()}`)
 * // Output: 'node', 'bun', 'deno', or 'unknown'
 */
module.exports.getRuntime = getRuntime;
