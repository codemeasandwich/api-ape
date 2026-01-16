/**
 * @fileoverview Bun Native WebSocket Adapter
 *
 * This module provides adapter classes that wrap Bun's native WebSocket
 * implementation to be compatible with the `ws` library API. This enables
 * api-ape to work seamlessly with Bun's high-performance WebSocket support.
 *
 * ## Why an Adapter?
 *
 * Bun has a unique WebSocket API compared to Node.js:
 * - WebSocket events are handled via object properties passed to `Bun.serve()`
 * - No automatic EventEmitter support on WebSocket instances
 * - Different method signatures and lifecycle management
 *
 * This adapter bridges these differences by:
 * - Wrapping Bun's WebSocket in an EventEmitter-based interface
 * - Providing `ws`-compatible methods (`send`, `close`, `readyState`)
 * - Managing the client tracking that `ws.WebSocketServer` provides
 *
 * ## Architecture
 *
 * ```
 * Bun.serve() ──> BunWebSocketServer ──> BunWebSocket
 *     │                   │                   │
 *     │ websocket: {      │ _clients Map      │ EventEmitter
 *     │   open, message,  │ handleUpgrade()   │ send(), close()
 *     │   close, error    │ clients Set       │ readyState
 *     │ }                 │                   │
 * ```
 *
 * ## Usage with api-ape
 *
 * This adapter is used internally by `server/lib/bun.js` to integrate
 * api-ape with Bun's native server. You typically don't need to use
 * it directly unless building custom Bun integrations.
 *
 * @module server/lib/ws/adapters/bun
 * @see {@link module:server/lib/bun} - Main Bun integration using this adapter
 * @see {@link module:server/lib/ws} - Polyfill WebSocket implementation
 *
 * @example
 * // Direct usage with Bun.serve()
 * const { BunWebSocketServer } = require('./ws/adapters/bun')
 *
 * const wss = new BunWebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('Client connected')
 *     ws.on('message', (data) => console.log('Received:', data))
 *     ws.send('Hello from Bun!')
 * })
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch(req, server) {
 *         if (new URL(req.url).pathname === '/ws') {
 *             return wss.handleUpgrade(req, server, null, () => {})
 *                 ? undefined
 *                 : new Response('Upgrade failed', { status: 500 })
 *         }
 *         return new Response('Hello')
 *     },
 *     websocket: wss.websocketHandlers
 * })
 *
 * @example
 * // Using BunWebSocket wrapper directly
 * const { BunWebSocket } = require('./ws/adapters/bun')
 *
 * // In Bun's websocket.open handler:
 * websocket: {
 *     open(bunSocket) {
 *         const ws = new BunWebSocket(bunSocket)
 *         ws.on('message', (data) => {
 *             console.log('Received:', data.toString())
 *         })
 *     }
 * }
 */

const { EventEmitter } = require("events");

/**
 * WebSocket ready state constants matching the W3C WebSocket API.
 *
 * @readonly
 * @enum {number}
 * @private
 */
const READY_STATES = {
  /** Connection is being established */
  CONNECTING: 0,
  /** Connection is open and ready */
  OPEN: 1,
  /** Connection is closing */
  CLOSING: 2,
  /** Connection is closed */
  CLOSED: 3,
};

/**
 * Wrapper around Bun's native WebSocket to provide ws-compatible API.
 *
 * Bun's WebSocket doesn't extend EventEmitter and uses a different event
 * model. This class wraps a Bun WebSocket and provides:
 * - EventEmitter-based events (message, close, error)
 * - ws-compatible methods (send, close)
 * - readyState property tracking
 *
 * ## Events
 *
 * | Event     | Arguments           | Description                    |
 * |-----------|---------------------|--------------------------------|
 * | `message` | `(data: Buffer)`    | Received a message             |
 * | `close`   | `(code?, reason?)`  | Connection was closed          |
 * | `error`   | `(err: Error)`      | An error occurred              |
 *
 * ## Internal Event Triggers
 *
 * The `_onMessage`, `_onClose`, and `_onError` methods are called by
 * BunWebSocketServer's websocket handlers to trigger the appropriate events.
 *
 * @class BunWebSocket
 * @extends EventEmitter
 *
 * @param {Object} bunSocket - Bun's native WebSocket instance
 *
 * @example
 * // Creating a wrapper (done by BunWebSocketServer)
 * const ws = new BunWebSocket(bunNativeSocket)
 *
 * ws.on('message', (data) => {
 *     console.log('Received:', data.toString())
 * })
 *
 * ws.send('Hello!')
 *
 * @example
 * // Check ready state before sending
 * if (ws.readyState === ws.OPEN) {
 *     ws.send(JSON.stringify({ type: 'ping' }))
 * }
 */
class BunWebSocket extends EventEmitter {
  /**
   * Create a new BunWebSocket wrapper.
   *
   * @param {Object} bunSocket - Bun's native WebSocket instance
   */
  constructor(bunSocket) {
    super();

    /**
     * The underlying Bun WebSocket instance.
     * @type {Object}
     * @private
     */
    this._socket = bunSocket;

    /**
     * Current connection state.
     * @type {number}
     * @private
     */
    this._readyState = READY_STATES.OPEN;

    // Expose ready states as instance properties for convenience
    /**
     * CONNECTING ready state constant (0).
     * @type {number}
     * @readonly
     */
    this.CONNECTING = READY_STATES.CONNECTING;

    /**
     * OPEN ready state constant (1).
     * @type {number}
     * @readonly
     */
    this.OPEN = READY_STATES.OPEN;

    /**
     * CLOSING ready state constant (2).
     * @type {number}
     * @readonly
     */
    this.CLOSING = READY_STATES.CLOSING;

    /**
     * CLOSED ready state constant (3).
     * @type {number}
     * @readonly
     */
    this.CLOSED = READY_STATES.CLOSED;
  }

  /**
   * Get the current ready state of the WebSocket connection.
   *
   * @type {number}
   * @readonly
   *
   * @example
   * if (ws.readyState === ws.OPEN) {
   *     ws.send('Safe to send')
   * }
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * Send data to the remote endpoint.
   *
   * Delegates to Bun's native WebSocket.send() method.
   * Data can be a string or Buffer.
   *
   * @param {string|Buffer} data - The data to send
   * @throws {Error} If the WebSocket is not in the OPEN state
   *
   * @example
   * // Send text
   * ws.send('Hello, World!')
   *
   * @example
   * // Send JSON
   * ws.send(JSON.stringify({ type: 'message', text: 'Hi!' }))
   *
   * @example
   * // Send binary
   * ws.send(Buffer.from([0x01, 0x02, 0x03]))
   */
  send(data) {
    if (this._readyState !== READY_STATES.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this._socket.send(data);
  }

  /**
   * Close the WebSocket connection.
   *
   * Initiates a graceful close by sending a close frame to the
   * remote endpoint with the specified code and reason.
   *
   * @param {number} [code=1000] - Close status code (1000-4999)
   * @param {string} [reason=''] - Human-readable close reason
   *
   * @example
   * // Normal close
   * ws.close()
   *
   * @example
   * // Close with code and reason
   * ws.close(1000, 'Session ended')
   *
   * @example
   * // Close due to error
   * ws.close(1008, 'Policy violation')
   */
  close(code = 1000, reason = "") {
    if (
      this._readyState === READY_STATES.CLOSING ||
      this._readyState === READY_STATES.CLOSED
    ) {
      return;
    }
    this._readyState = READY_STATES.CLOSING;
    this._socket.close(code, reason);
  }

  /**
   * Internal handler for incoming messages.
   *
   * Called by BunWebSocketServer when Bun's websocket.message event fires.
   * Converts the data to a Buffer and emits the 'message' event.
   *
   * @param {string|Buffer|ArrayBuffer} data - The received message data
   * @private
   *
   * @example
   * // Called internally by BunWebSocketServer
   * wrapper._onMessage(messageData)
   */
  _onMessage(data) {
    // Ensure data is always a Buffer for consistency with ws library
    this.emit("message", Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  /**
   * Internal handler for connection close.
   *
   * Called by BunWebSocketServer when Bun's websocket.close event fires.
   * Updates the ready state and emits the 'close' event.
   *
   * @param {number} code - Close status code
   * @param {string} reason - Close reason
   * @private
   */
  _onClose(code, reason) {
    this._readyState = READY_STATES.CLOSED;
    this.emit("close", code, reason);
  }

  /**
   * Internal handler for errors.
   *
   * Called by BunWebSocketServer when Bun's websocket.error event fires.
   * Emits the 'error' event with the error object.
   *
   * @param {Error} error - The error that occurred
   * @private
   */
  _onError(error) {
    this.emit("error", error);
  }
}

/**
 * WebSocket server adapter for Bun's native WebSocket implementation.
 *
 * This class provides a `ws.WebSocketServer`-compatible interface for use
 * with Bun's unique server architecture. It manages client connections
 * and provides the websocket handlers that Bun.serve() expects.
 *
 * ## Key Differences from ws.WebSocketServer
 *
 * 1. **websocketHandlers**: Bun requires websocket handlers to be passed
 *    to `Bun.serve()`. Access these via `wss.websocketHandlers`.
 *
 * 2. **handleUpgrade**: Uses `server.upgrade()` instead of raw socket
 *    manipulation.
 *
 * 3. **Client Storage**: Uses a Map internally (Bun socket → wrapper)
 *    but exposes a Set via the `clients` property for compatibility.
 *
 * ## Events
 *
 * | Event        | Arguments                    | Description              |
 * |--------------|------------------------------|--------------------------|
 * | `connection` | `(ws: BunWebSocket, req?)`   | New client connected     |
 *
 * @class BunWebSocketServer
 * @extends EventEmitter
 *
 * @param {Object} [options={}] - Server configuration
 * @param {boolean} [options.noServer=false] - Run without creating HTTP server
 *
 * @example
 * // Basic setup with Bun.serve()
 * const wss = new BunWebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('Client connected')
 *     ws.send('Welcome!')
 * })
 *
 * Bun.serve({
 *     port: 3000,
 *     fetch(req, server) {
 *         if (new URL(req.url).pathname === '/ws') {
 *             const upgraded = server.upgrade(req)
 *             return upgraded ? undefined : new Response('Upgrade failed', { status: 500 })
 *         }
 *         return new Response('Not found', { status: 404 })
 *     },
 *     websocket: wss.websocketHandlers
 * })
 *
 * @example
 * // Broadcasting to all clients
 * function broadcast(message) {
 *     for (const client of wss.clients) {
 *         if (client.readyState === client.OPEN) {
 *             client.send(message)
 *         }
 *     }
 * }
 */
class BunWebSocketServer extends EventEmitter {
  /**
   * Create a new BunWebSocketServer instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.noServer=false] - Run in noServer mode
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
     * Map of Bun native sockets to their BunWebSocket wrappers.
     * @type {Map<Object, BunWebSocket>}
     * @private
     */
    this._clients = new Map();

    /**
     * Bun websocket event handlers for use with Bun.serve().
     *
     * Pass this object to the `websocket` option of Bun.serve():
     * ```javascript
     * Bun.serve({
     *     websocket: wss.websocketHandlers
     * })
     * ```
     *
     * @type {Object}
     * @property {Function} open - Called when connection opens
     * @property {Function} message - Called when message received
     * @property {Function} close - Called when connection closes
     * @property {Function} error - Called when error occurs
     */
    this.websocketHandlers = {
      open: (ws) => this._handleOpen(ws),
      message: (ws, message) => this._handleMessage(ws, message),
      close: (ws, code, reason) => this._handleClose(ws, code, reason),
      error: (ws, error) => this._handleError(ws, error),
    };
  }

  /**
   * Get all connected WebSocket clients.
   *
   * Returns a Set of BunWebSocket wrappers for compatibility with
   * the ws library API. The internal storage is a Map for efficient
   * Bun socket → wrapper lookup.
   *
   * @type {Set<BunWebSocket>}
   * @readonly
   *
   * @example
   * console.log(`${wss.clients.size} clients connected`)
   *
   * @example
   * // Broadcast to all clients
   * for (const client of wss.clients) {
   *     client.send('Hello everyone!')
   * }
   */
  get clients() {
    return new Set(this._clients.values());
  }

  /**
   * Handle an HTTP upgrade request for WebSocket connection.
   *
   * Uses Bun's `server.upgrade()` method to upgrade the connection.
   * The callback and request are stored in the socket's data for
   * access in the open handler.
   *
   * @param {Request} req - The HTTP request object
   * @param {Object} server - Bun server instance with upgrade() method
   * @param {Buffer} head - First packet of upgraded stream (unused in Bun)
   * @param {Function} callback - Called with the BunWebSocket wrapper
   * @returns {boolean} True if upgrade was successful
   *
   * @example
   * // In Bun.serve() fetch handler
   * fetch(req, server) {
   *     if (shouldUpgrade(req)) {
   *         const success = wss.handleUpgrade(req, server, null, (ws) => {
   *             wss.emit('connection', ws, req)
   *         })
   *         return success ? undefined : new Response('Failed', { status: 500 })
   *     }
   * }
   */
  handleUpgrade(req, server, head, callback) {
    const upgraded = server.upgrade(req, { data: { callback, req } });
    return !!upgraded;
  }

  /**
   * Internal handler for WebSocket open event.
   *
   * Creates a BunWebSocket wrapper, adds it to the clients map,
   * and emits the 'connection' event.
   *
   * @param {Object} bunSocket - Bun's native WebSocket instance
   * @private
   */
  _handleOpen(bunSocket) {
    const wrapper = new BunWebSocket(bunSocket);
    this._clients.set(bunSocket, wrapper);

    // Retrieve callback and request from socket data
    const { callback, req } = bunSocket.data || {};

    // Invoke callback if provided (from handleUpgrade)
    if (callback) {
      callback(wrapper);
    }

    // Emit connection event for ws compatibility
    this.emit("connection", wrapper, req);
  }

  /**
   * Internal handler for WebSocket message event.
   *
   * Routes the message to the appropriate BunWebSocket wrapper.
   *
   * @param {Object} bunSocket - Bun's native WebSocket instance
   * @param {string|Buffer} message - The received message
   * @private
   */
  _handleMessage(bunSocket, message) {
    const wrapper = this._clients.get(bunSocket);
    if (wrapper) {
      wrapper._onMessage(message);
    }
  }

  /**
   * Internal handler for WebSocket close event.
   *
   * Triggers the close event on the wrapper and removes it from
   * the clients map.
   *
   * @param {Object} bunSocket - Bun's native WebSocket instance
   * @param {number} code - Close status code
   * @param {string} reason - Close reason
   * @private
   */
  _handleClose(bunSocket, code, reason) {
    const wrapper = this._clients.get(bunSocket);
    if (wrapper) {
      wrapper._onClose(code, reason);
      this._clients.delete(bunSocket);
    }
  }

  /**
   * Internal handler for WebSocket error event.
   *
   * Routes the error to the appropriate BunWebSocket wrapper.
   *
   * @param {Object} bunSocket - Bun's native WebSocket instance
   * @param {Error} error - The error that occurred
   * @private
   */
  _handleError(bunSocket, error) {
    const wrapper = this._clients.get(bunSocket);
    if (wrapper) {
      wrapper._onError(error);
    }
  }

  /**
   * Close the server and all active connections.
   *
   * Sends a close frame with code 1001 (Going Away) to all connected
   * clients and clears the clients map.
   *
   * @param {Function} [callback] - Called after all connections are closed
   *
   * @example
   * // Graceful shutdown
   * wss.close(() => {
   *     console.log('All WebSocket connections closed')
   * })
   */
  close(callback) {
    for (const [, wrapper] of this._clients) {
      wrapper.close(1001, "Server shutting down");
    }
    this._clients.clear();
    if (callback) {
      callback();
    }
  }
}

module.exports = {
  /**
   * BunWebSocket class - ws-compatible wrapper for Bun WebSocket.
   * @type {typeof BunWebSocket}
   */
  BunWebSocket,

  /**
   * BunWebSocketServer class - ws-compatible server for Bun.
   * @type {typeof BunWebSocketServer}
   */
  BunWebSocketServer,
};
