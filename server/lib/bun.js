/**
 * @fileoverview Bun-Specific api-ape Integration
 *
 * This module provides Bun-native integration for api-ape servers.
 * It returns handlers that can be directly used with `Bun.serve()`,
 * taking advantage of Bun's high-performance WebSocket implementation.
 *
 * Bun has a unique server API compared to Node.js:
 * - WebSocket upgrades are handled via `server.upgrade()` in the fetch handler
 * - WebSocket events are handled via a separate `websocket` object
 * - The `fetch` function handles all HTTP requests
 *
 * This module provides a seamless integration that:
 * - Handles WebSocket upgrades for the api-ape endpoint
 * - Serves the client JavaScript bundle
 * - Wraps Bun's native WebSocket in a ws-compatible interface
 *
 * @module server/lib/bun
 * @see {@link module:server/lib/runtimes/bun} - Runtime-specific initialization
 * @see {@link module:server/lib/ws/adapters/bun} - Bun WebSocket adapter
 *
 * @example
 * // Basic usage with Bun.serve()
 * import { apeBun } from 'api-ape/bun'
 *
 * const ape = apeBun({
 *     where: 'api',
 *     onConnect: (socket, req, send) => {
 *         console.log('Client connected')
 *         return {
 *             onDisconnect: () => console.log('Client disconnected'),
 *             embed: { userId: 'user-123' }
 *         }
 *     }
 * })
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch: ape.fetch,
 *     websocket: ape.websocket
 * })
 *
 * @example
 * // Combined with custom routes
 * Bun.serve({
 *     port: 3000,
 *     fetch(req, server) {
 *         // Try api-ape routes first
 *         const apeResponse = ape.fetch(req, server)
 *         if (apeResponse !== null) return apeResponse
 *
 *         // Custom routes
 *         const url = new URL(req.url)
 *         if (url.pathname === '/health') {
 *             return new Response('OK')
 *         }
 *
 *         return new Response('Not Found', { status: 404 })
 *     },
 *     websocket: ape.websocket
 * })
 */

const loader = require("./loader");
const wiring = require("./wiring");
const path = require("path");
const fs = require("fs");
const { getFileTransferManager } = require("./fileTransfer");
const { BunWebSocket, BunWebSocketServer } = require("./ws/adapters/bun");

/**
 * @typedef {Object} ApeBunOptions
 * Configuration options for the Bun api-ape integration.
 *
 * @property {string} where - Directory containing controller files (relative to cwd).
 *     Controllers in this directory become API endpoints.
 *     Example: 'api' means controllers in './api/' folder.
 * @property {Function} [onConnect] - Callback when a client connects.
 *     Receives (socket, req, send) and can return { onDisconnect, embed }.
 * @property {Object} [fileTransferOptions] - Options for the file transfer manager.
 */

/**
 * @typedef {Object} ApeBunResult
 * The result object containing handlers for Bun.serve().
 *
 * @property {Function} fetch - HTTP request handler for Bun.serve().
 *     Returns Response for api-ape routes, null for non-matching routes.
 * @property {Object} websocket - WebSocket event handlers for Bun.serve().
 * @property {BunWebSocketServer} wss - The WebSocket server instance.
 */

/**
 * @typedef {Object} BunWebSocketHandlers
 * WebSocket event handlers for Bun.serve().
 *
 * @property {Function} open - Called when a WebSocket connection opens
 * @property {Function} message - Called when a message is received
 * @property {Function} close - Called when a connection closes
 * @property {Function} error - Called when an error occurs
 */

/**
 * Creates api-ape handlers for use with Bun.serve().
 *
 * This function sets up everything needed to run api-ape on Bun:
 * - Loads controllers from the specified directory
 * - Creates a WebSocket server with Bun-native adapter
 * - Returns fetch and websocket handlers for Bun.serve()
 *
 * The returned `fetch` handler:
 * - Handles WebSocket upgrades at `/{where}/ape`
 * - Serves the client bundle at `/{where}/ape.js`
 * - Returns `null` for non-matching routes (allows fallthrough)
 *
 * The returned `websocket` handler:
 * - Wraps Bun's native WebSocket in ws-compatible interface
 * - Routes messages through api-ape's wiring layer
 * - Handles connection lifecycle (open, message, close, error)
 *
 * @function apeBun
 * @param {ApeBunOptions} options - Configuration options
 * @param {string} options.where - Controller directory name
 * @param {Function} [options.onConnect] - Connection callback
 * @param {Object} [options.fileTransferOptions] - File transfer options
 * @returns {ApeBunResult} Object with fetch, websocket, and wss properties
 *
 * @example
 * // Minimal setup
 * const ape = apeBun({ where: 'api' })
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch: ape.fetch,
 *     websocket: ape.websocket
 * })
 *
 * @example
 * // With connection handler
 * const ape = apeBun({
 *     where: 'api',
 *     onConnect: async (socket, req, send) => {
 *         // Authenticate user from cookies/headers
 *         const token = req.headers.get('authorization')
 *         const user = await verifyToken(token)
 *
 *         return {
 *             embed: { userId: user.id, role: user.role },
 *             onDisconnect: () => {
 *                 console.log(`User ${user.id} disconnected`)
 *             }
 *         }
 *     }
 * })
 *
 * @example
 * // With file transfer options
 * const ape = apeBun({
 *     where: 'api',
 *     fileTransferOptions: {
 *         startTimeout: 30000,
 *         completeTimeout: 60000
 *     }
 * })
 */
function apeBun({ where, urlPrefix, onConnect, fileTransferOptions }) {
  /**
   * Load controllers from the specified directory. Absolute paths are passed
   * verbatim; relative paths resolve against the loader's cached cwd.
   * @type {Object<string, Function>}
   */
  const controllers = loader(where);

  /**
   * Public URL prefix for the api-ape routes. Decoupled from `where` so a
   * caller can pass an absolute filesystem path in `where` (for cwd-stable
   * controller loading) without leaking the absolute path into URLs. The
   * default derives from `where`: an absolute path collapses to its
   * basename (`/srv/app/api` → `api`); a relative path is used verbatim
   * (`'api'` → `'api'`, `'src/api'` → `'src/api'`). Override explicitly
   * with `urlPrefix` when neither default fits.
   * @type {string}
   */
  const publicPrefix = urlPrefix
    ? urlPrefix.replace(/^\/+|\/+$/g, "")
    : path.isAbsolute(where)
      ? path.basename(where)
      : where.replace(/^\.?\/+|\/+$/g, "");

  /**
   * File transfer manager for handling binary uploads/downloads.
   * @type {import('./fileTransfer').FileTransferManager}
   */
  const fileTransfer = getFileTransferManager(fileTransferOptions);

  /**
   * WebSocket server instance with Bun adapter.
   * @type {BunWebSocketServer}
   */
  const wss = new BunWebSocketServer({ noServer: true });

  /**
   * WebSocket path for api-ape connections.
   * @type {string}
   */
  const wsPath = `/${publicPrefix}/ape`;

  /**
   * Wiring handler that processes WebSocket connections and messages.
   * @type {Function}
   */
  const wiringHandler = wiring(controllers, onConnect, fileTransfer);

  // Handle WebSocket connections through the wiring layer
  wss.on("connection", wiringHandler);

  /**
   * Bun fetch handler for HTTP requests and WebSocket upgrades.
   *
   * Routes handled:
   * - `/{where}/ape` - WebSocket upgrade endpoint
   * - `/{where}/ape.js` - Client JavaScript bundle
   *
   * @function fetch
   * @param {Request} req - Bun Request object
   * @param {Object} server - Bun server instance with upgrade() method
   * @returns {Response|null|undefined} Response for handled routes, null/undefined for others
   *
   * @example
   * // In Bun.serve()
   * fetch(req, server) {
   *     const apeResponse = ape.fetch(req, server)
   *     if (apeResponse !== null) return apeResponse
   *     // ... handle other routes
   * }
   */
  function fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle WebSocket upgrade requests
    if (pathname === wsPath) {
      const upgrade = req.headers.get("upgrade");
      if (upgrade?.toLowerCase() === "websocket") {
        // Use Bun's native upgrade mechanism
        // Store request in data for access in websocket.open
        const success = server.upgrade(req, {
          data: { req },
        });
        if (success) {
          // Return undefined to signal Bun handles the response
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
    }

    // Serve the client JavaScript bundle
    if (pathname === `/${publicPrefix}/ape.js`) {
      try {
        const filePath = path.join(__dirname, "../../dist/ape.js");
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": "application/javascript" },
        });
      } catch {
        return new Response("Client bundle not found", { status: 500 });
      }
    }

    // Health check / captive portal detection endpoint
    if (pathname === `/${publicPrefix}/ape/ping` && req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Not an api-ape route - return null to allow fallthrough
    return null;
  }

  /**
   * Bun WebSocket event handlers.
   *
   * These handlers are passed directly to Bun.serve() and handle
   * the WebSocket lifecycle events. Each handler wraps Bun's native
   * WebSocket in a ws-compatible BunWebSocket adapter.
   *
   * @type {BunWebSocketHandlers}
   */
  const websocket = {
    /**
     * Called when a WebSocket connection is opened.
     * Creates a BunWebSocket wrapper and passes to the wiring handler.
     *
     * @param {Object} ws - Bun's native WebSocket instance
     */
    open(ws) {
      // Create ws-compatible wrapper around Bun's WebSocket
      const wrapper = new BunWebSocket(ws);
      wss._clients.set(ws, wrapper);

      // Get the original request from upgrade data
      const { req } = ws.data || {};

      // Pass to wiring handler for api-ape processing
      wiringHandler(wrapper, req);
    },

    /**
     * Called when a message is received on the WebSocket.
     * Routes the message through the wrapper's event system.
     *
     * @param {Object} ws - Bun's native WebSocket instance
     * @param {string|Buffer} message - The received message
     */
    message(ws, message) {
      const wrapper = wss._clients.get(ws);
      if (wrapper) {
        wrapper._onMessage(message);
      }
    },

    /**
     * Called when a WebSocket connection is closed.
     * Triggers close event and cleans up the wrapper.
     *
     * @param {Object} ws - Bun's native WebSocket instance
     * @param {number} code - Close status code
     * @param {string} reason - Close reason
     */
    close(ws, code, reason) {
      const wrapper = wss._clients.get(ws);
      if (wrapper) {
        wrapper._onClose(code, reason);
        wss._clients.delete(ws);
      }
    },

    /**
     * Called when an error occurs on the WebSocket.
     * Routes the error through the wrapper's event system.
     *
     * @param {Object} ws - Bun's native WebSocket instance
     * @param {Error} error - The error that occurred
     */
    error(ws, error) {
      const wrapper = wss._clients.get(ws);
      if (wrapper) {
        wrapper._onError(error);
      }
    },
  };

  return {
    fetch,
    websocket,
    wss,
  };
}

module.exports = { apeBun };
