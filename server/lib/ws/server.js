/**
 * @fileoverview WebSocket Server Implementation - RFC 6455 Compliant
 *
 * This module provides a WebSocket server that handles HTTP upgrade requests
 * and manages WebSocket connections. It's designed as a lightweight, zero-dependency
 * alternative to the popular `ws` library with compatible API.
 *
 * The server operates in "noServer" mode, meaning it doesn't create its own
 * HTTP server. Instead, it integrates with an existing HTTP server by handling
 * upgrade requests forwarded to it.
 *
 * ## Connection Flow
 *
 * 1. HTTP server receives an upgrade request
 * 2. Server validates the request headers (Upgrade, Sec-WebSocket-Key)
 * 3. Server generates the accept key and sends 101 Switching Protocols
 * 4. WebSocket connection is established
 * 5. Server emits 'connection' event with the WebSocket instance
 *
 * ## Key Features
 *
 * - RFC 6455 compliant WebSocket handshake
 * - Client tracking via `clients` Set
 * - Compatible with `ws` library API patterns
 * - Automatic cleanup on connection close
 *
 * @module server/lib/ws/server
 * @see {@link module:server/lib/ws/socket} - WebSocket connection class
 * @see {@link module:server/lib/ws/frames} - Frame encoding/decoding
 * @see {@link https://tools.ietf.org/html/rfc6455#section-4.2} - RFC 6455 Handshake
 *
 * @example
 * // Basic setup with HTTP server
 * const http = require('http')
 * const { WebSocketServer } = require('./server')
 *
 * const server = http.createServer()
 * const wss = new WebSocketServer({ noServer: true })
 *
 * server.on('upgrade', (req, socket, head) => {
 *     wss.handleUpgrade(req, socket, head, (ws) => {
 *         wss.emit('connection', ws, req)
 *     })
 * })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('Client connected from:', req.socket.remoteAddress)
 *     ws.on('message', (data) => console.log('Received:', data))
 *     ws.send('Welcome!')
 * })
 *
 * server.listen(8080)
 *
 * @example
 * // Broadcasting to all clients
 * function broadcast(message) {
 *     for (const client of wss.clients) {
 *         if (client.readyState === WebSocket.OPEN) {
 *             client.send(message)
 *         }
 *     }
 * }
 *
 * @example
 * // Graceful shutdown
 * process.on('SIGTERM', () => {
 *     wss.close(() => {
 *         console.log('All WebSocket connections closed')
 *         server.close()
 *     })
 * })
 */

const { EventEmitter } = require("events");
const { generateAcceptKey } = require("./frames");
const { WebSocket } = require("./socket");

/**
 * @typedef {Object} WebSocketServerOptions
 * Configuration options for creating a WebSocketServer.
 *
 * @property {boolean} [noServer=false] - When true, the server doesn't create
 *     its own HTTP server. Upgrade requests must be manually forwarded via
 *     `handleUpgrade()`. This is the typical mode for api-ape integration.
 */

/**
 * @typedef {function(WebSocket): void} UpgradeCallback
 * Callback function invoked after successful WebSocket upgrade.
 *
 * @param {WebSocket} ws - The newly created WebSocket connection
 */

/**
 * WebSocket server for handling HTTP upgrade requests and managing connections.
 *
 * This class extends EventEmitter and provides a ws-compatible API for
 * accepting WebSocket connections. It validates upgrade requests according
 * to RFC 6455 and manages the lifecycle of all connected clients.
 *
 * ## Events
 *
 * - **connection**: Emitted when a new WebSocket connection is established.
 *   Listeners receive `(ws: WebSocket, req: http.IncomingMessage)`.
 *
 * ## Client Management
 *
 * The server maintains a Set of all connected clients accessible via the
 * `clients` property. Clients are automatically added on connection and
 * removed when the connection closes.
 *
 * @class WebSocketServer
 * @extends EventEmitter
 *
 * @param {WebSocketServerOptions} [options={}] - Server configuration
 *
 * @example
 * // Create server in noServer mode (typical usage)
 * const wss = new WebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('New connection')
 *
 *     ws.on('message', (data) => {
 *         // Echo back
 *         ws.send(data)
 *     })
 *
 *     ws.on('close', () => {
 *         console.log('Client disconnected')
 *     })
 * })
 *
 * @example
 * // Access all connected clients
 * console.log(`${wss.clients.size} clients connected`)
 *
 * // Iterate over clients
 * for (const client of wss.clients) {
 *     client.send(JSON.stringify({ type: 'ping' }))
 * }
 */
class WebSocketServer extends EventEmitter {
  /**
   * Create a new WebSocketServer instance.
   *
   * @param {WebSocketServerOptions} [options={}] - Configuration options
   * @param {boolean} [options.noServer=false] - Run without creating HTTP server
   *
   * @example
   * // Standard noServer mode for integration
   * const wss = new WebSocketServer({ noServer: true })
   *
   * @example
   * // Default options
   * const wss = new WebSocketServer()
   */
  constructor(options = {}) {
    super();

    /**
     * Whether this server operates in noServer mode.
     * @type {boolean}
     * @private
     */
    this._noServer = options.noServer || false;

    /**
     * Set of all connected WebSocket clients.
     * Clients are automatically added on connection and removed on close.
     * @type {Set<WebSocket>}
     * @private
     */
    this._clients = new Set();
  }

  /**
   * Get all connected WebSocket clients.
   *
   * Returns a Set containing all active WebSocket connections managed by
   * this server. Clients are automatically added when connections are
   * established and removed when connections close.
   *
   * Use this to broadcast messages, count connections, or iterate over
   * all clients for any purpose.
   *
   * @type {Set<WebSocket>}
   * @readonly
   *
   * @example
   * // Count connected clients
   * console.log(`Active connections: ${wss.clients.size}`)
   *
   * @example
   * // Broadcast to all clients
   * const message = JSON.stringify({ type: 'announcement', text: 'Hello!' })
   * for (const client of wss.clients) {
   *     if (client.readyState === 1) { // OPEN
   *         client.send(message)
   *     }
   * }
   *
   * @example
   * // Find specific client
   * const targetClient = [...wss.clients].find(c => c.userId === targetId)
   * if (targetClient) {
   *     targetClient.send('Direct message')
   * }
   */
  get clients() {
    return this._clients;
  }

  /**
   * Handle an HTTP upgrade request and establish a WebSocket connection.
   *
   * This method validates the upgrade request according to RFC 6455:
   * 1. Checks for `Upgrade: websocket` header
   * 2. Validates `Sec-WebSocket-Key` header (must be 16 bytes, base64 encoded)
   * 3. Generates the accept key using SHA-1 hash
   * 4. Sends HTTP 101 Switching Protocols response
   * 5. Creates WebSocket wrapper and invokes callback
   *
   * If validation fails, the socket is destroyed without response.
   *
   * ## Security Note
   *
   * The Sec-WebSocket-Key validation ensures the request came from a
   * WebSocket client and prevents cross-protocol attacks. The accept key
   * is computed as: `base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`
   *
   * @param {http.IncomingMessage} req - The HTTP upgrade request
   * @param {net.Socket} socket - The underlying TCP socket
   * @param {Buffer} head - First packet of the upgraded stream (usually empty)
   * @param {UpgradeCallback} [callback] - Called with the WebSocket instance
   *
   * @example
   * // Basic upgrade handling
   * server.on('upgrade', (req, socket, head) => {
   *     if (req.url === '/ws') {
   *         wss.handleUpgrade(req, socket, head, (ws) => {
   *             wss.emit('connection', ws, req)
   *         })
   *     } else {
   *         socket.destroy()
   *     }
   * })
   *
   * @example
   * // With authentication check
   * server.on('upgrade', (req, socket, head) => {
   *     const token = new URL(req.url, 'http://localhost').searchParams.get('token')
   *
   *     if (!isValidToken(token)) {
   *         socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
   *         socket.destroy()
   *         return
   *     }
   *
   *     wss.handleUpgrade(req, socket, head, (ws) => {
   *         ws.userId = getUserIdFromToken(token)
   *         wss.emit('connection', ws, req)
   *     })
   * })
   *
   * @example
   * // Multiple WebSocket endpoints
   * server.on('upgrade', (req, socket, head) => {
   *     const pathname = new URL(req.url, 'http://localhost').pathname
   *
   *     if (pathname === '/chat') {
   *         chatServer.handleUpgrade(req, socket, head, (ws) => {
   *             chatServer.emit('connection', ws, req)
   *         })
   *     } else if (pathname === '/notifications') {
   *         notifyServer.handleUpgrade(req, socket, head, (ws) => {
   *             notifyServer.emit('connection', ws, req)
   *         })
   *     } else {
   *         socket.destroy()
   *     }
   * })
   */
  handleUpgrade(req, socket, head, callback) {
    // Validate WebSocket upgrade request
    const upgrade = req.headers["upgrade"];
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }

    // Validate key is valid base64 (16 bytes = 24 chars base64)
    if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) {
      socket.destroy();
      return;
    }

    // Generate accept key per RFC 6455
    const acceptKey = generateAcceptKey(key);

    // Build HTTP 101 Switching Protocols response
    const headers = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "", // Empty line to end headers
    ].join("\r\n");

    // Send handshake response
    socket.write(headers);

    // If there's buffered data after upgrade, process it
    // The 'head' contains any data received after the upgrade request
    // We'll handle this in the WebSocket's buffer

    // Create WebSocket wrapper around the TCP socket
    const ws = new WebSocket(socket);
    this._clients.add(ws);

    // Remove from clients set when connection closes
    ws.on("close", () => {
      this._clients.delete(ws);
    });

    // Handle any buffered data from the upgrade request
    /* istanbul ignore next 3 - buffered upgrade data rare in practice */
    if (head && head.length > 0) {
      socket.unshift(head);
    }

    // Invoke callback with the new WebSocket
    callback(ws);
  }

  /**
   * Close the server and all active connections.
   *
   * Iterates through all connected clients and sends a close frame with
   * code 1001 (Going Away) and reason "Server shutting down". All clients
   * are then removed from the clients set.
   *
   * This method should be called during graceful shutdown to properly
   * terminate all WebSocket connections.
   *
   * @param {function(): void} [callback] - Called after all connections are closed
   *
   * @example
   * // Graceful shutdown on process termination
   * process.on('SIGTERM', () => {
   *     console.log('Shutting down...')
   *
   *     wss.close(() => {
   *         console.log('All WebSocket connections closed')
   *         httpServer.close(() => {
   *             console.log('HTTP server closed')
   *             process.exit(0)
   *         })
   *     })
   * })
   *
   * @example
   * // Close with custom message broadcast first
   * function shutdown() {
   *     // Notify clients before closing
   *     for (const client of wss.clients) {
   *         client.send(JSON.stringify({ type: 'shutdown', message: 'Server restarting' }))
   *     }
   *
   *     // Give clients time to receive the message
   *     setTimeout(() => {
   *         wss.close(() => {
   *             console.log('Shutdown complete')
   *         })
   *     }, 100)
   * }
   *
   * @example
   * // Simple close without callback
   * wss.close()
   */
  close(callback) {
    for (const client of this._clients) {
      client.close(1001, "Server shutting down");
    }
    this._clients.clear();
    if (callback) {
      callback();
    }
  }
}

module.exports = { WebSocketServer };
