/**
 * @fileoverview Bun Runtime Integration for api-ape
 *
 * This module provides runtime-specific integration for running api-ape
 * on Bun. It handles the unique aspects of Bun's server API, including
 * WebSocket upgrades, hot reloading, and the fetch/websocket architecture.
 *
 * ## Bun Server Architecture
 *
 * Bun servers work differently from Node.js HTTP servers:
 * - Single `fetch` function handles all HTTP requests
 * - WebSocket upgrades via `server.upgrade()` in fetch handler
 * - Separate `websocket` object for WebSocket event handlers
 * - Hot reload capability via `server.reload()`
 *
 * ## Integration Modes
 *
 * This module supports two integration patterns:
 *
 * 1. **Fresh Server**: Create new Bun.serve() with api-ape handlers
 *    ```javascript
 *    const { fetch, websocket } = initBunServer(options, core)
 *    Bun.serve({ port: 3000, fetch, websocket })
 *    ```
 *
 * 2. **Existing Server**: Inject api-ape into running server via reload
 *    ```javascript
 *    const server = Bun.serve({ ... })
 *    initBunServerWithReload(server, options, core)
 *    ```
 *
 * ## Routes Handled
 *
 * The fetch handler manages these api-ape routes:
 * - `/{where}/ape` - WebSocket upgrade endpoint
 * - `/{where}/ape.js` - Client JavaScript bundle
 * - `/{where}/ape.js.map` - Source map for debugging
 * - `/{where}/ping` - Health check endpoint
 *
 * @module server/lib/runtimes/bun
 * @see {@link module:server/lib/bun} - High-level Bun integration
 * @see {@link module:server/lib/ws/adapters/bun} - Bun WebSocket adapter
 * @see {@link module:server/lib/runtimes/node} - Node.js runtime equivalent
 *
 * @example
 * // Pattern 1: Fresh server setup
 * const { initBunServer } = require('./runtimes/bun')
 *
 * const core = prepareCore(options)
 * const { fetch, websocket } = initBunServer(options, core)
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch,
 *     websocket
 * })
 *
 * @example
 * // Pattern 2: Inject into existing server
 * const { initBunServerWithReload } = require('./runtimes/bun')
 *
 * const server = Bun.serve({
 *     port: 3000,
 *     fetch(req) {
 *         return new Response('Hello')
 *     },
 *     websocket: { message() {} }  // Required placeholder
 * })
 *
 * const core = prepareCore(options)
 * initBunServerWithReload(server, options, core)
 * // Server is now api-ape enabled!
 */

const path = require("path");
const fs = require("fs");
const { isBun } = require("../wsProvider");

/**
 * Check if a server object is a Bun server instance.
 *
 * Bun servers have a unique `reload()` method for hot-reloading
 * server configuration. This function checks for that method
 * to identify Bun servers.
 *
 * @function isBunServer
 * @param {Object} server - Server object to check
 * @returns {boolean} True if this is a Bun server instance
 *
 * @example
 * const server = Bun.serve({ port: 3000, fetch: () => {} })
 * console.log(isBunServer(server))  // true
 *
 * @example
 * const http = require('http')
 * const server = http.createServer()
 * console.log(isBunServer(server))  // false
 *
 * @example
 * // Used internally to select appropriate initialization
 * if (isBunServer(server)) {
 *     initBunServerWithReload(server, options, core)
 * } else {
 *     initNodeServer(server, options, core)
 * }
 */
function isBunServer(server) {
  return isBun() && typeof server?.reload === "function";
}

/**
 * @typedef {Object} BunServerHandlers
 * Handlers returned by initBunServer for use with Bun.serve().
 *
 * @property {Function} fetch - HTTP request handler
 * @property {Object} websocket - WebSocket event handlers
 * @property {Map<Object, BunWebSocket>} clients - Map of connected clients
 * @property {Object} core - Reference to the core api-ape configuration
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
 * Initialize api-ape handlers for a new Bun server.
 *
 * Creates the `fetch` and `websocket` handlers needed for Bun.serve().
 * This is used when creating a new server specifically for api-ape.
 *
 * ## Fetch Handler Routes
 *
 * The fetch handler manages these endpoints:
 *
 * | Path | Method | Description |
 * |------|--------|-------------|
 * | `/{where}/ape` | GET (upgrade) | WebSocket upgrade endpoint |
 * | `/{where}/ape.js` | GET | Client JavaScript bundle |
 * | `/{where}/ape.js.map` | GET | Source map for client |
 * | `/{where}/ping` | GET | Health check (returns `{ ok: true, ts }`) |
 *
 * For non-matching routes, the fetch handler returns `null`, allowing
 * you to handle them in your own logic.
 *
 * ## WebSocket Handlers
 *
 * The websocket object contains handlers for all WebSocket lifecycle events.
 * Each handler wraps Bun's native WebSocket in a BunWebSocket adapter
 * for compatibility with api-ape's wiring layer.
 *
 * @function initBunServer
 * @param {Object} options - Server configuration options
 * @param {string} options.where - Base path for api-ape endpoints
 * @param {Object} core - Core api-ape configuration from prepareCore()
 * @param {string} core.wsPath - WebSocket endpoint path
 * @param {string} core.clientPath - Client bundle path
 * @param {string} core.clientMapPath - Source map path
 * @param {string} core.pingPath - Health check path
 * @param {Function} core.wiringHandler - Handler for WebSocket connections
 * @returns {BunServerHandlers} Object with fetch, websocket, clients, and core
 *
 * @example
 * // Create a dedicated api-ape server
 * const { initBunServer } = require('./runtimes/bun')
 *
 * const core = prepareCore({ where: 'api', onConnect })
 * const { fetch, websocket } = initBunServer({ where: 'api' }, core)
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch,
 *     websocket
 * })
 *
 * @example
 * // Combine with custom routes
 * const { fetch: apeFetch, websocket } = initBunServer(options, core)
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch(req, server) {
 *         // Try api-ape routes first
 *         const apeResponse = apeFetch(req, server)
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
 *     websocket
 * })
 *
 * @example
 * // Access connected clients
 * const { clients } = initBunServer(options, core)
 *
 * // Later, broadcast to all clients
 * for (const [bunSocket, wrapper] of clients) {
 *     wrapper.send(JSON.stringify({ type: 'broadcast', data: 'Hello!' }))
 * }
 */
function initBunServer(options, core) {
  const { BunWebSocket } = require("../ws/adapters/bun");

  /**
   * Map of Bun native sockets to their BunWebSocket wrappers.
   * @type {Map<Object, BunWebSocket>}
   */
  const clients = new Map();

  /**
   * HTTP request handler for Bun.serve().
   *
   * Handles api-ape specific routes and returns null for others,
   * allowing custom handling in the caller.
   *
   * @param {Request} req - Bun Request object
   * @param {Object} server - Bun server instance
   * @returns {Response|null|undefined} Response for handled routes, null for others
   */
  function fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // WebSocket upgrade endpoint
    if (pathname === core.wsPath) {
      const upgrade = req.headers.get("upgrade");
      if (upgrade?.toLowerCase() === "websocket") {
        const success = server.upgrade(req, { data: { req } });
        if (success) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
    }

    // Client JavaScript bundle
    if (pathname === core.clientPath) {
      try {
        const filePath = path.join(__dirname, "../../../dist/ape.js");
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": "application/javascript" },
        });
      } catch {
        return new Response("Client bundle not found", { status: 500 });
      }
    }

    // Source map for client bundle
    if (pathname === core.clientMapPath) {
      try {
        const filePath = path.join(__dirname, "../../../dist/ape.js.map");
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response("Source map not found", { status: 404 });
      }
    }

    // Health check endpoint
    if (pathname === core.pingPath && req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Not an api-ape route - return null for custom handling
    return null;
  }

  /**
   * WebSocket event handlers for Bun.serve().
   * @type {BunWebSocketHandlers}
   */
  const websocket = {
    /**
     * Handle WebSocket connection open.
     * Creates a BunWebSocket wrapper and passes to wiring handler.
     *
     * @param {Object} ws - Bun's native WebSocket
     */
    open(ws) {
      const wrapper = new BunWebSocket(ws);
      clients.set(ws, wrapper);
      const { req } = ws.data || {};
      core.wiringHandler(wrapper, req);
    },

    /**
     * Handle incoming WebSocket message.
     * Routes to the appropriate wrapper's message handler.
     *
     * @param {Object} ws - Bun's native WebSocket
     * @param {string|Buffer} message - The received message
     */
    message(ws, message) {
      const wrapper = clients.get(ws);
      if (wrapper) wrapper._onMessage(message);
    },

    /**
     * Handle WebSocket connection close.
     * Triggers close event and cleans up client tracking.
     *
     * @param {Object} ws - Bun's native WebSocket
     * @param {number} code - Close status code
     * @param {string} reason - Close reason
     */
    close(ws, code, reason) {
      const wrapper = clients.get(ws);
      if (wrapper) {
        wrapper._onClose(code, reason);
        clients.delete(ws);
      }
    },

    /**
     * Handle WebSocket error.
     * Routes error to the appropriate wrapper.
     *
     * @param {Object} ws - Bun's native WebSocket
     * @param {Error} error - The error that occurred
     */
    error(ws, error) {
      const wrapper = clients.get(ws);
      if (wrapper) wrapper._onError(error);
    },
  };

  return { fetch, websocket, clients, core };
}

/**
 * Inject api-ape into an existing Bun server via hot reload.
 *
 * Uses Bun's `server.reload()` method to inject api-ape handlers
 * into a running server without restart. This is the recommended
 * approach when adding api-ape to an existing Bun application.
 *
 * ## Prerequisites
 *
 * The original server MUST have a `websocket` property defined,
 * even if it's just a placeholder:
 *
 * ```javascript
 * const server = Bun.serve({
 *     fetch(req) { ... },
 *     websocket: { message() {} }  // Required!
 * })
 * ```
 *
 * ## How It Works
 *
 * 1. Saves reference to the original fetch handler
 * 2. Creates a wrapper fetch that checks api-ape routes first
 * 3. Falls through to original fetch for non-api-ape routes
 * 4. Creates WebSocket handlers for api-ape connections
 * 5. Calls `server.reload()` with the new configuration
 *
 * ## Error Handling
 *
 * Throws a helpful error if WebSocket support isn't enabled
 * and transport isn't set to 'longpolling'.
 *
 * @function initBunServerWithReload
 * @param {Object} server - Existing Bun server instance
 * @param {Object} options - Server configuration options
 * @param {string} [options.transport] - Transport mode ('websocket' or 'longpolling')
 * @param {Object} core - Core api-ape configuration
 * @returns {{ clients: Map, core: Object }} Object with clients map and core reference
 * @throws {Error} If WebSocket support isn't enabled and transport isn't 'longpolling'
 *
 * @example
 * // Basic injection into existing server
 * const server = Bun.serve({
 *     port: 3000,
 *     fetch(req) {
 *         return new Response('Hello from existing app!')
 *     },
 *     websocket: { message() {} }  // Required placeholder
 * })
 *
 * // Inject api-ape
 * const core = prepareCore({ where: 'api', onConnect })
 * initBunServerWithReload(server, { where: 'api' }, core)
 *
 * // Server now handles both original routes and api-ape routes
 *
 * @example
 * // With existing WebSocket handlers
 * const server = Bun.serve({
 *     port: 3000,
 *     fetch(req) { ... },
 *     websocket: {
 *         message(ws, msg) {
 *             // Your existing WebSocket logic
 *         }
 *     }
 * })
 *
 * // Note: api-ape will replace WebSocket handlers
 * // Only api-ape WebSocket connections will work after injection
 * initBunServerWithReload(server, options, core)
 *
 * @example
 * // Long-polling only mode (no WebSocket required)
 * const server = Bun.serve({
 *     port: 3000,
 *     fetch(req) { return new Response('Hello') }
 *     // No websocket property needed!
 * })
 *
 * initBunServerWithReload(server, { transport: 'longpolling' }, core)
 */
function initBunServerWithReload(server, options, core) {
  const { BunWebSocket } = require("../ws/adapters/bun");

  /**
   * Map of Bun native sockets to their BunWebSocket wrappers.
   * @type {Map<Object, BunWebSocket>}
   */
  const clients = new Map();

  // Check for WebSocket support
  const hasWebSocketSupport = typeof server.upgrade === "function";

  if (!hasWebSocketSupport && options.transport !== "longpolling") {
    throw new Error(`
🦍 api-ape: Bun WebSocket support not enabled!

To enable WebSocket support in Bun, add a 'websocket' property when creating your server:

    const server = Bun.serve({
        port: 3000,
        fetch(req) { ... },
        websocket: { message() {} }  // <-- Required for api-ape
    })

If you only want HTTP long-polling, pass: ape(server, { where: 'api', transport: 'longpolling' })
`);
  }

  // Save reference to original fetch handler
  const originalFetch = server.fetch;

  /**
   * Wrapped fetch handler that checks api-ape routes first,
   * then falls through to the original handler.
   *
   * @param {Request} req - Bun Request object
   * @param {Object} server - Bun server instance
   * @returns {Response|undefined} Response for the request
   */
  function wrappedFetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // WebSocket upgrade endpoint
    if (pathname === core.wsPath) {
      const upgrade = req.headers.get("upgrade");
      if (upgrade?.toLowerCase() === "websocket") {
        const success = server.upgrade(req, { data: { req } });
        if (success) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
    }

    // Client JavaScript bundle
    if (pathname === core.clientPath) {
      try {
        const filePath = path.join(__dirname, "../../../dist/ape.js");
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": "application/javascript" },
        });
      } catch {
        return new Response("Client bundle not found", { status: 500 });
      }
    }

    // Source map for client bundle
    if (pathname === core.clientMapPath) {
      try {
        const filePath = path.join(__dirname, "../../../dist/ape.js.map");
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response("Source map not found", { status: 404 });
      }
    }

    // Health check endpoint
    if (pathname === core.pingPath && req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Not an api-ape route - delegate to original fetch
    if (originalFetch) return originalFetch(req, server);

    // No original fetch - return 404
    return new Response("Not Found", { status: 404 });
  }

  /**
   * WebSocket event handlers for the reloaded server.
   * @type {BunWebSocketHandlers}
   */
  const websocket = {
    /**
     * Handle WebSocket connection open.
     */
    open(ws) {
      const wrapper = new BunWebSocket(ws);
      clients.set(ws, wrapper);
      const { req } = ws.data || {};
      core.wiringHandler(wrapper, req);
    },

    /**
     * Handle incoming WebSocket message.
     */
    message(ws, message) {
      const wrapper = clients.get(ws);
      if (wrapper) wrapper._onMessage(message);
    },

    /**
     * Handle WebSocket connection close.
     */
    close(ws, code, reason) {
      const wrapper = clients.get(ws);
      if (wrapper) {
        wrapper._onClose(code, reason);
        clients.delete(ws);
      }
    },

    /**
     * Handle WebSocket error.
     */
    error(ws, error) {
      const wrapper = clients.get(ws);
      if (wrapper) wrapper._onError(error);
    },
  };

  // Hot-reload the server with new handlers
  server.reload({ fetch: wrappedFetch, websocket });

  return { clients, core };
}

module.exports = {
  /**
   * Check if a server is a Bun server instance.
   * @function
   */
  isBunServer,

  /**
   * Initialize api-ape handlers for a new Bun server.
   * @function
   */
  initBunServer,

  /**
   * Inject api-ape into an existing Bun server via hot reload.
   * @function
   */
  initBunServerWithReload,
};
