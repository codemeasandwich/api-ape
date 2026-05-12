/**
 * @fileoverview Node.js / Express Runtime Integration for api-ape
 *
 * This module provides runtime-specific integration for running api-ape
 * on Node.js HTTP servers. It handles WebSocket upgrades, HTTP routes for
 * file transfers, and integrates with existing Express/Node.js request handlers.
 *
 * ## Node.js Server Architecture
 *
 * Node.js HTTP servers use a different pattern than Bun:
 * - HTTP requests handled via 'request' event listeners
 * - WebSocket upgrades handled via 'upgrade' event
 * - Multiple request listeners can coexist
 *
 * ## Integration Approach
 *
 * This module injects api-ape handlers into an existing HTTP server by:
 * 1. Adding a WebSocket upgrade handler for the api-ape endpoint
 * 2. Prepending a request handler that intercepts api-ape routes
 * 3. Delegating non-api-ape requests to existing handlers
 *
 * ## Routes Handled
 *
 * The request handler manages these api-ape routes:
 * - `/{where}/ape.js` - Client JavaScript bundle
 * - `/{where}/ape.js.map` - Source map for debugging
 * - `/{where}/ping` - Health check endpoint
 * - `/{where}/poll` (GET) - Long polling stream endpoint
 * - `/{where}/poll` (POST) - Long polling message endpoint
 * - `/{where}/download/:hash` - File download endpoint
 * - `/{where}/upload/:queryId/:hash` - File upload endpoint
 *
 * @module server/lib/runtimes/node
 * @see {@link module:server/lib/runtimes/bun} - Bun runtime equivalent
 * @see {@link module:server/lib/wsProvider} - WebSocket provider selection
 * @see {@link module:server/lib/httpUtils} - HTTP utility functions
 *
 * @example
 * // Basic integration with Node.js HTTP server
 * const http = require('http')
 * const { initNodeServer } = require('./runtimes/node')
 *
 * const server = http.createServer((req, res) => {
 *     res.writeHead(200)
 *     res.end('Hello World')
 * })
 *
 * const core = prepareCore({ where: 'api', onConnect })
 * initNodeServer(server, { where: 'api' }, core)
 *
 * server.listen(3000)
 *
 * @example
 * // Integration with Express
 * const express = require('express')
 * const { initNodeServer } = require('./runtimes/node')
 *
 * const app = express()
 * app.get('/', (req, res) => res.send('Hello'))
 *
 * const server = app.listen(3000)
 *
 * const core = prepareCore({ where: 'api', onConnect })
 * initNodeServer(server, { where: 'api' }, core)
 *
 * @example
 * // With authentication middleware
 * const { initNodeServer } = require('./runtimes/node')
 *
 * const core = prepareCore({
 *     where: 'api',
 *     onConnect: async (socket, req, send) => {
 *         const token = req.headers.cookie?.match(/token=([^;]+)/)?.[1]
 *         const user = await verifyToken(token)
 *
 *         if (!user) {
 *             socket.close(4001, 'Unauthorized')
 *             return null
 *         }
 *
 *         return {
 *             embed: { userId: user.id },
 *             onDisconnect: () => console.log('User disconnected')
 *         }
 *     }
 * })
 *
 * initNodeServer(server, options, core)
 */

const { getWebSocketProvider } = require("../wsProvider");
const { parse: parseUrl } = require("url");
const {
  matchRoute,
  sendJson,
  getCookie,
  isLocalhost,
  isSecure,
  serveClientBundle,
  serveSourceMap,
} = require("../httpUtils");
const { createSchemaHandler } = require("../schema");

/**
 * @typedef {Object} NodeServerResult
 * Result from initializing the Node.js server integration.
 *
 * @property {WebSocketServer} wss - The WebSocket server instance
 * @property {Object} core - Reference to the core api-ape configuration
 */

/**
 * Initialize api-ape on an existing Node.js HTTP server.
 *
 * This function integrates api-ape into a Node.js/Express server by:
 * 1. Creating a WebSocket server in noServer mode
 * 2. Adding an upgrade handler for WebSocket connections
 * 3. Injecting a request handler for api-ape HTTP routes
 * 4. Preserving existing request handlers
 *
 * ## WebSocket Upgrade
 *
 * Listens for the 'upgrade' event on the HTTP server and handles
 * WebSocket upgrades for the api-ape endpoint path. Non-api-ape
 * upgrade requests are destroyed.
 *
 * ## Request Handling
 *
 * The function captures existing 'request' listeners and replaces them
 * with a single handler that:
 * 1. Checks if the request matches an api-ape route
 * 2. Handles api-ape routes (client bundle, polling, file transfer)
 * 3. Delegates non-api-ape requests to the original handlers
 *
 * ## Routes Handled
 *
 * | Path | Method | Description |
 * |------|--------|-------------|
 * | `/{where}/ape.js` | GET | Client JavaScript bundle |
 * | `/{where}/ape.js.map` | GET | Source map for debugging |
 * | `/{where}/ping` | GET | Health check (returns `{ ok: true, ts }`) |
 * | `/{where}/poll` | GET | Long polling stream endpoint |
 * | `/{where}/poll` | POST | Long polling message endpoint |
 * | `/{where}/download/:hash` | GET | File download |
 * | `/{where}/upload/:qid/:hash` | PUT | File upload |
 *
 * @function initNodeServer
 * @param {http.Server} server - Node.js HTTP server instance
 * @param {Object} options - Server configuration options
 * @param {string} options.where - Base path for api-ape endpoints
 * @param {Object} core - Core api-ape configuration from prepareCore()
 * @param {string} core.wsPath - WebSocket endpoint path
 * @param {string} core.clientPath - Client bundle path
 * @param {string} core.clientMapPath - Source map path
 * @param {string} core.pingPath - Health check path
 * @param {string} core.pollPath - Long polling path
 * @param {string} core.downloadPattern - Download route pattern
 * @param {string} core.uploadPattern - Upload route pattern
 * @param {Function} core.wiringHandler - Handler for WebSocket connections
 * @param {Function} core.handleStreamGet - Long polling GET handler
 * @param {Function} core.handleStreamPost - Long polling POST handler
 * @param {Object} core.controllers - Loaded controller functions
 * @param {Object} core.fileTransfer - File transfer manager
 * @returns {NodeServerResult} Object with wss and core properties
 *
 * @example
 * // Basic Node.js HTTP server
 * const http = require('http')
 *
 * const server = http.createServer((req, res) => {
 *     res.writeHead(404)
 *     res.end('Not Found')
 * })
 *
 * const { initNodeServer } = require('./runtimes/node')
 * const { wss, core } = initNodeServer(server, options, coreConfig)
 *
 * console.log(`WebSocket server ready with ${wss.clients.size} clients`)
 *
 * @example
 * // Express integration
 * const express = require('express')
 * const app = express()
 *
 * app.get('/', (req, res) => res.send('Home'))
 * app.get('/api/status', (req, res) => res.json({ status: 'ok' }))
 *
 * const server = app.listen(3000)
 * initNodeServer(server, { where: 'api' }, core)
 *
 * // Both Express routes and api-ape routes work:
 * // GET / -> Express handler
 * // GET /api/status -> Express handler
 * // GET /api/ape.js -> api-ape client bundle
 * // WS /api/ape -> api-ape WebSocket
 *
 * @example
 * // Access WebSocket server for custom logic
 * const { wss } = initNodeServer(server, options, core)
 *
 * // Broadcast to all WebSocket clients
 * setInterval(() => {
 *     for (const client of wss.clients) {
 *         if (client.readyState === 1) {
 *             client.send(JSON.stringify({ type: 'tick', time: Date.now() }))
 *         }
 *     }
 * }, 1000)
 */
function initNodeServer(server, options, core) {
  // Get the appropriate WebSocket provider (ws library or polyfill)
  const { WebSocketServer } = getWebSocketProvider();

  /**
   * WebSocket server instance in noServer mode.
   * This allows manual handling of upgrade requests.
   * @type {WebSocketServer}
   */
  // Cap inbound WebSocket frames at 1 MB.  The ws library will
  // cleanly close the connection with a 1009 (Message Too Big) code
  // instead of buffering unbounded payloads into memory and crashing.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });

  /**
   * Schema endpoint path and handler for IntelliSense support.
   * @type {string}
   */
  const schemaPath = `/${options.where}/ape/schema`;
  const schemaHandler = createSchemaHandler(core.controllersDir);

  // Connect WebSocket server to api-ape wiring handler
  wss.on("connection", core.wiringHandler);

  /**
   * Handle HTTP upgrade requests for WebSocket connections.
   *
   * Only upgrades requests to the api-ape WebSocket path.
   * All other upgrade requests are rejected by destroying the socket.
   */
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parseUrl(req.url);

    if (pathname === core.wsPath) {
      // Handle api-ape WebSocket upgrade
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Reject non-api-ape WebSocket upgrades
      socket.destroy();
    }
  });

  /**
   * Capture existing request listeners to preserve them.
   * We'll call them for non-api-ape routes.
   * @type {Function[]}
   */
  const originalListeners = server.listeners("request").slice();

  // Remove all request listeners - we'll add a single handler
  // that delegates to the originals when appropriate
  server.removeAllListeners("request");

  /**
   * Unified request handler for api-ape and original routes.
   *
   * Checks each request against api-ape routes first, then
   * delegates to original handlers if not matched.
   */
  server.on("request", (req, res) => {
    const { pathname } = parseUrl(req.url);

    // Serve client JavaScript bundle
    if (pathname === core.clientPath) {
      return serveClientBundle(core.clientPath, res);
    }

    // Serve source map for debugging
    if (pathname === core.clientMapPath) {
      return serveSourceMap(res);
    }

    // Health check endpoint
    if (pathname === core.pingPath && req.method === "GET") {
      return sendJson(res, 200, { ok: true, ts: Date.now() });
    }

    // Schema endpoint for IntelliSense/LSP
    if (pathname === schemaPath && req.method === "GET") {
      return schemaHandler(req, res);
    }

    // Handle CORS preflight for schema endpoint
    if (pathname === schemaPath && req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204);
      return res.end();
    }

    // Long polling GET - streaming response
    if (pathname === core.pollPath && req.method === "GET") {
      core.handleStreamGet(req, res);
      return;
    }

    // Long polling POST - client messages
    if (pathname === core.pollPath && req.method === "POST") {
      core.handleStreamPost(req, res, core.controllers);
      return;
    }

    // File download endpoint
    const downloadMatch = matchRoute(pathname, core.downloadPattern);
    if (req.method === "GET" && downloadMatch) {
      return handleDownload(req, res, downloadMatch.hash, core);
    }

    // File upload endpoint
    const uploadMatch = matchRoute(pathname, core.uploadPattern);
    if (req.method === "PUT" && uploadMatch) {
      return handleUpload(req, res, uploadMatch, core);
    }

    // Not an api-ape route - delegate to original handlers
    for (const listener of originalListeners) {
      listener.call(server, req, res);
    }
  });

  return { wss, core };
}

/**
 * Handle file download requests.
 *
 * Supports two types of downloads:
 * 1. **Streaming files**: Files being transferred between clients
 * 2. **Standard downloads**: Files registered for download by a client
 *
 * ## Streaming Files
 *
 * When a file is being streamed between clients, the server acts as a
 * relay. The download response includes headers indicating completion
 * status and total bytes received so far.
 *
 * ## Security
 *
 * - HTTPS required for non-localhost requests
 * - Client ID from cookie or header required for authorization
 * - Download hash must be registered and authorized for the client
 *
 * @function handleDownload
 * @param {http.IncomingMessage} req - The HTTP request
 * @param {http.ServerResponse} res - The HTTP response
 * @param {string} hash - The download hash from the URL
 * @param {Object} core - Core api-ape configuration
 * @returns {void}
 * @private
 *
 * @example
 * // Download URL format: /{where}/download/{hash}
 * // GET /api/download/abc123xyz
 *
 * @example
 * // Streaming file response headers:
 * // Content-Type: application/octet-stream
 * // X-Ape-Complete: 0 (or 1 when complete)
 * // X-Ape-Total-Received: 1234 (bytes received so far)
 */
function handleDownload(req, res, hash, core) {
  // Check for streaming file first (client-to-client transfer)
  const streamingFile = core.fileTransfer.getStreamingFile(hash);

  /* istanbul ignore if - streaming file download, requires client-to-client streaming setup */
  if (streamingFile) {
    // Security: Require HTTPS for non-localhost
    if (!isLocalhost(req.headers.host) && !isSecure(req)) {
      return sendJson(res, 403, {
        error: "HTTPS required for file transfers",
      });
    }

    // Send streaming file with progress headers
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": streamingFile.data.length,
      "X-Ape-Complete": streamingFile.isComplete ? "1" : "0",
      "X-Ape-Total-Received": String(streamingFile.totalReceived),
    });
    res.end(streamingFile.data);
    return;
  }

  // Standard download - requires client authentication
  const clientId =
    getCookie(req.headers, "apeClientId") || req.headers["x-ape-client-id"];

  if (!clientId) {
    return sendJson(res, 401, { error: "Missing session identifier" });
  }

  // Security: Require HTTPS for non-localhost
  if (!isLocalhost(req.headers.host) && !isSecure(req)) {
    return sendJson(res, 403, { error: "HTTPS required for file transfers" });
  }

  // Get the download data for this client
  const result = core.fileTransfer.getDownload(hash, clientId);

  if (!result) {
    return sendJson(res, 404, { error: "Download not found or unauthorized" });
  }

  // Send the file data
  res.writeHead(200, {
    "Content-Type": result.contentType,
    "Content-Length": result.data.length,
  });
  res.end(result.data);
}

/**
 * Handle file upload requests.
 *
 * Supports two types of uploads:
 * 1. **Streaming uploads**: Completing a streaming file transfer
 * 2. **Standard uploads**: Binary data for pending message fields
 *
 * ## Upload Flow
 *
 * 1. Client sends a message with `<!B>` or `<!A>` tagged fields
 * 2. Server holds the message pending binary data
 * 3. Client uploads binary data via PUT to this endpoint
 * 4. Server completes the message with the uploaded data
 * 5. Controller is invoked with the complete message
 *
 * ## Security
 *
 * - HTTPS required for non-localhost requests
 * - Client ID required for authorization
 * - Query ID and path hash must match pending upload
 *
 * @function handleUpload
 * @param {http.IncomingMessage} req - The HTTP request
 * @param {http.ServerResponse} res - The HTTP response
 * @param {Object} match - Route match containing queryId and pathHash
 * @param {string} match.queryId - Query ID from pending message
 * @param {string} match.pathHash - Hash identifying the upload field
 * @param {Object} core - Core api-ape configuration
 * @returns {void}
 * @private
 *
 * @example
 * // Upload URL format: /{where}/upload/{queryId}/{pathHash}
 * // PUT /api/upload/K7M3NP2Q/abc123xyz
 * // Body: <binary data>
 *
 * @example
 * // Success response:
 * // { "success": true }
 *
 * // Streaming success response:
 * // { "success": true, "streaming": true }
 *
 * @example
 * // Error responses:
 * // 401: { "error": "Missing session identifier" }
 * // 403: { "error": "HTTPS required for file transfers" }
 * // 404: { "error": "Upload not expected or unauthorized" }
 */
function handleUpload(req, res, match, core) {
  const { queryId, pathHash } = match;

  // Security: Require HTTPS for non-localhost
  if (!isLocalhost(req.headers.host) && !isSecure(req)) {
    return sendJson(res, 403, { error: "HTTPS required for file transfers" });
  }

  // Collect request body chunks
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));

  req.on("end", () => {
    // Concatenate all chunks into a single Buffer
    const data = Buffer.concat(chunks);

    /* istanbul ignore if - streaming file upload, requires client-to-client streaming setup */
    // Check if this is a streaming file upload
    if (core.fileTransfer.isStreamingFile(pathHash)) {
      const success = core.fileTransfer.completeStreamingUpload(pathHash, data);

      if (success) {
        return sendJson(res, 200, { success: true, streaming: true });
      }

      return sendJson(res, 404, { error: "Streaming file not found" });
    }

    // Standard upload - requires client authentication
    const clientId =
      getCookie(req.headers, "apeClientId") || req.headers["x-ape-client-id"];

    if (!clientId) {
      return sendJson(res, 401, { error: "Missing session identifier" });
    }

    // Attempt to receive the upload
    const success = core.fileTransfer.receiveUpload(
      queryId,
      pathHash,
      data,
      clientId,
    );

    if (success) {
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 404, { error: "Upload not expected or unauthorized" });
    }
  });

  // Handle request errors
  /* istanbul ignore next - request error handler, requires network failure */
  req.on("error", (err) => sendJson(res, 500, { error: err.message }));
}

module.exports = {
  /**
   * Initialize api-ape on an existing Node.js HTTP server.
   * @function
   */
  initNodeServer,
};
