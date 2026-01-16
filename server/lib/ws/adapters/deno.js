/**
 * @fileoverview Deno Native WebSocket Adapter
 *
 * This module provides adapter classes that wrap Deno's native WebSocket
 * implementation to be compatible with the `ws` library API. This enables
 * api-ape to work seamlessly with Deno's runtime.
 *
 * ## Why an Adapter?
 *
 * Deno has a unique WebSocket API compared to Node.js:
 * - Uses `Deno.upgradeWebSocket(req)` which returns `{ socket, response }`
 * - WebSocket uses `onmessage`, `onclose`, `onerror` properties instead of EventEmitter
 * - The upgrade process returns a Response that must be returned from the handler
 *
 * This adapter bridges these differences by:
 * - Wrapping Deno's WebSocket in an EventEmitter-based interface
 * - Providing `ws`-compatible methods (`send`, `close`, `readyState`)
 * - Handling the upgrade response flow that Deno requires
 *
 * ## Architecture
 *
 * ```
 * Deno.serve() ──> DenoWebSocketServer ──> DenoWebSocket
 *       │                  │                    │
 *       │ Request          │ handleUpgrade()    │ EventEmitter
 *       │ Response         │ clients Set        │ send(), close()
 *       │                  │                    │ readyState
 * ```
 *
 * ## Usage with Deno
 *
 * ```javascript
 * const { DenoWebSocketServer } = require('./ws/adapters/deno')
 *
 * const wss = new DenoWebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     ws.on('message', (data) => console.log('Received:', data))
 *     ws.send('Hello from Deno!')
 * })
 *
 * Deno.serve((req) => {
 *     if (new URL(req.url).pathname === '/ws') {
 *         const result = wss.handleUpgrade(req)
 *         return result?.response || new Response('Upgrade failed', { status: 500 })
 *     }
 *     return new Response('Hello')
 * })
 * ```
 *
 * @module server/lib/ws/adapters/deno
 * @see {@link module:server/lib/ws} - Polyfill WebSocket implementation
 * @see {@link module:server/lib/ws/adapters/bun} - Similar adapter for Bun runtime
 *
 * @example
 * // Basic Deno server with WebSocket
 * const { DenoWebSocketServer } = require('./ws/adapters/deno')
 *
 * const wss = new DenoWebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws) => {
 *     console.log('Client connected')
 *
 *     ws.on('message', (data) => {
 *         console.log('Message:', data.toString())
 *         ws.send('Echo: ' + data.toString())
 *     })
 *
 *     ws.on('close', () => {
 *         console.log('Client disconnected')
 *     })
 * })
 *
 * @example
 * // Broadcasting to all connected clients
 * function broadcast(message) {
 *     for (const client of wss.clients) {
 *         if (client.readyState === client.OPEN) {
 *             client.send(message)
 *         }
 *     }
 * }
 */

const { EventEmitter } = require("events");

/**
 * WebSocket ready state constants matching the W3C WebSocket API.
 *
 * These match the standard WebSocket readyState values and are
 * compatible with both the browser WebSocket API and the ws library.
 *
 * @readonly
 * @enum {number}
 * @private
 */
const READY_STATES = {
  /** Connection is being established (0) */
  CONNECTING: 0,
  /** Connection is open and ready for communication (1) */
  OPEN: 1,
  /** Connection is in the process of closing (2) */
  CLOSING: 2,
  /** Connection has been closed (3) */
  CLOSED: 3,
};

/**
 * Wrapper around Deno's native WebSocket to provide ws-compatible API.
 *
 * Deno's WebSocket uses property-based event handlers (`onmessage`, `onclose`,
 * `onerror`) instead of Node.js EventEmitter pattern. This class bridges
 * that difference by:
 * - Extending EventEmitter for event-based API
 * - Wiring Deno's property handlers to emit events
 * - Converting message data to Buffer for consistency
 *
 * ## Events
 *
 * | Event     | Arguments           | Description                    |
 * |-----------|---------------------|--------------------------------|
 * | `message` | `(data: Buffer)`    | Received a message             |
 * | `close`   | `(code?, reason?)`  | Connection was closed          |
 * | `error`   | `(event)`           | An error occurred              |
 *
 * ## Data Handling
 *
 * All incoming messages are converted to Buffer for consistency with
 * the ws library. String messages are encoded as UTF-8 Buffers.
 *
 * When sending, Buffers are converted to ArrayBuffer (which Deno's
 * WebSocket expects), while strings are passed through directly.
 *
 * @class DenoWebSocket
 * @extends EventEmitter
 *
 * @param {WebSocket} denoSocket - Deno's native WebSocket instance
 *
 * @example
 * // Creating a wrapper (done by DenoWebSocketServer)
 * const { socket } = Deno.upgradeWebSocket(req)
 * const ws = new DenoWebSocket(socket)
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
 *
 * @example
 * // Handle connection close
 * ws.on('close', (code, reason) => {
 *     console.log(`Connection closed: ${code} - ${reason}`)
 * })
 */
class DenoWebSocket extends EventEmitter {
  /**
   * Create a new DenoWebSocket wrapper.
   *
   * Sets up the wrapper around Deno's native WebSocket and wires
   * up the event handlers to emit EventEmitter events.
   *
   * @param {WebSocket} denoSocket - Deno's native WebSocket instance
   *     (from Deno.upgradeWebSocket())
   */
  constructor(denoSocket) {
    super();

    /**
     * The underlying Deno WebSocket instance.
     * @type {WebSocket}
     * @private
     */
    this._socket = denoSocket;

    /**
     * Current connection state.
     * @type {number}
     * @private
     */
    this._readyState = READY_STATES.OPEN;

    // Expose ready states as instance properties for convenience
    // (matching ws library API)

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

    // Wire up Deno's event properties to our EventEmitter
    this._setupDenoEvents();
  }

  /**
   * Get the current ready state of the WebSocket connection.
   *
   * @type {number}
   * @readonly
   *
   * @example
   * switch (ws.readyState) {
   *     case ws.CONNECTING:
   *         console.log('Connecting...')
   *         break
   *     case ws.OPEN:
   *         console.log('Ready to send')
   *         ws.send('Hello!')
   *         break
   *     case ws.CLOSING:
   *         console.log('Closing...')
   *         break
   *     case ws.CLOSED:
   *         console.log('Closed')
   *         break
   * }
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * Setup Deno WebSocket event handlers.
   *
   * Wires Deno's property-based event handlers (`onmessage`, `onclose`,
   * `onerror`) to emit EventEmitter events for ws library compatibility.
   *
   * Message data is converted to Buffer for consistency with the ws
   * library, which always provides Buffer instances for message data.
   *
   * @private
   */
  _setupDenoEvents() {
    /**
     * Handle incoming messages from Deno's WebSocket.
     * Converts all data to Buffer for consistency with ws library.
     */
    this._socket.onmessage = (event) => {
      // Convert to Buffer for consistency with ws library
      const data = event.data;
      const buffer =
        typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
      this.emit("message", buffer);
    };

    /**
     * Handle connection close from Deno's WebSocket.
     * Updates ready state and emits close event with code and reason.
     */
    this._socket.onclose = (event) => {
      this._readyState = READY_STATES.CLOSED;
      this.emit("close", event.code, event.reason);
    };

    /**
     * Handle errors from Deno's WebSocket.
     * Emits the error event with the event object.
     */
    this._socket.onerror = (event) => {
      this.emit("error", event);
    };
  }

  /**
   * Send data to the remote endpoint.
   *
   * Deno's WebSocket.send() accepts string, ArrayBuffer, or Blob.
   * This method handles the conversion from Buffer (Node.js style)
   * to ArrayBuffer (Deno style).
   *
   * @param {string|Buffer|ArrayBuffer} data - Data to send
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
   * // Send binary data
   * ws.send(Buffer.from([0x01, 0x02, 0x03, 0x04]))
   *
   * @example
   * // Safe send with state check
   * if (ws.readyState === ws.OPEN) {
   *     ws.send('Safe message')
   * }
   */
  send(data) {
    if (this._readyState !== READY_STATES.OPEN) {
      throw new Error("WebSocket is not open");
    }

    // Deno's WebSocket.send() accepts string, ArrayBuffer, or Blob
    // Convert Buffer to ArrayBuffer for Deno compatibility
    if (Buffer.isBuffer(data)) {
      // Extract the underlying ArrayBuffer, accounting for Buffer offset
      this._socket.send(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      );
    } else {
      // String or ArrayBuffer - pass through directly
      this._socket.send(data);
    }
  }

  /**
   * Close the WebSocket connection.
   *
   * Initiates a graceful close by sending a close frame to the
   * remote endpoint with the specified code and reason.
   *
   * Standard close codes (RFC 6455):
   * - `1000` - Normal closure
   * - `1001` - Going away (e.g., server shutdown)
   * - `1002` - Protocol error
   * - `1003` - Unsupported data type
   * - `1008` - Policy violation
   * - `1011` - Unexpected server error
   *
   * @param {number} [code=1000] - Close status code (1000-4999)
   * @param {string} [reason=''] - Human-readable close reason (max 123 bytes)
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
   *
   * @example
   * // Server shutdown
   * ws.close(1001, 'Server restarting')
   */
  close(code = 1000, reason = "") {
    // Don't close if already closing or closed
    if (
      this._readyState === READY_STATES.CLOSING ||
      this._readyState === READY_STATES.CLOSED
    ) {
      return;
    }

    this._readyState = READY_STATES.CLOSING;
    this._socket.close(code, reason);
  }
}

/**
 * WebSocket server adapter for Deno's native WebSocket implementation.
 *
 * This class provides a `ws.WebSocketServer`-compatible interface for use
 * with Deno's unique server architecture. It handles the upgrade process
 * using `Deno.upgradeWebSocket()` and manages client connections.
 *
 * ## Key Differences from ws.WebSocketServer
 *
 * 1. **handleUpgrade Return Value**: Returns `{ response }` which must be
 *    returned from the Deno request handler.
 *
 * 2. **Upgrade Mechanism**: Uses `Deno.upgradeWebSocket()` internally
 *    instead of raw socket manipulation.
 *
 * 3. **No HTTP Server Integration**: Designed for noServer mode only,
 *    integrates with `Deno.serve()`.
 *
 * ## Events
 *
 * | Event        | Arguments                    | Description              |
 * |--------------|------------------------------|--------------------------|
 * | `connection` | `(ws: DenoWebSocket, req)`   | New client connected     |
 *
 * @class DenoWebSocketServer
 * @extends EventEmitter
 *
 * @param {Object} [options={}] - Server configuration
 * @param {boolean} [options.noServer=false] - Run without creating HTTP server
 *
 * @example
 * // Basic setup with Deno.serve()
 * const wss = new DenoWebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('Client connected')
 *     ws.on('message', (data) => console.log('Received:', data))
 *     ws.send('Welcome!')
 * })
 *
 * Deno.serve((req) => {
 *     const url = new URL(req.url)
 *
 *     if (url.pathname === '/ws') {
 *         const result = wss.handleUpgrade(req)
 *         if (result) {
 *             return result.response
 *         }
 *         return new Response('Upgrade failed', { status: 500 })
 *     }
 *
 *     return new Response('Hello from Deno!')
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
 *
 * @example
 * // Graceful shutdown
 * async function shutdown() {
 *     wss.close(() => {
 *         console.log('All WebSocket connections closed')
 *     })
 * }
 */
class DenoWebSocketServer extends EventEmitter {
  /**
   * Create a new DenoWebSocketServer instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.noServer=false] - Run in noServer mode
   *     (this is the typical mode for Deno integration)
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
     * Set of all connected DenoWebSocket clients.
     * @type {Set<DenoWebSocket>}
     * @private
     */
    this._clients = new Set();
  }

  /**
   * Get all connected WebSocket clients.
   *
   * Returns a Set of DenoWebSocket wrappers for all active connections.
   * Clients are automatically added when connections are established
   * and removed when connections close.
   *
   * @type {Set<DenoWebSocket>}
   * @readonly
   *
   * @example
   * // Count connected clients
   * console.log(`${wss.clients.size} clients connected`)
   *
   * @example
   * // Broadcast to all clients
   * for (const client of wss.clients) {
   *     if (client.readyState === client.OPEN) {
   *         client.send('Hello everyone!')
   *     }
   * }
   *
   * @example
   * // Convert to array for filtering
   * const activeClients = [...wss.clients].filter(c =>
   *     c.readyState === c.OPEN
   * )
   */
  get clients() {
    return this._clients;
  }

  /**
   * Handle an HTTP upgrade request using Deno.upgradeWebSocket.
   *
   * This method uses Deno's built-in `Deno.upgradeWebSocket()` function
   * to upgrade the HTTP connection to a WebSocket. The returned object
   * contains a `response` property that MUST be returned from the Deno
   * request handler.
   *
   * ## Deno Upgrade Flow
   *
   * 1. Check for 'Upgrade: websocket' header
   * 2. Call `Deno.upgradeWebSocket(req)` to get socket and response
   * 3. Wrap the socket in DenoWebSocket adapter
   * 4. Add to clients set and emit 'connection' event
   * 5. Return `{ response }` for the caller to return to Deno
   *
   * @param {Request} req - Deno Request object
   * @param {*} _socket - Not used in Deno (placeholder for API compatibility)
   * @param {*} _head - Not used in Deno (placeholder for API compatibility)
   * @param {Function} [callback] - Called with the DenoWebSocket wrapper
   * @returns {{ response: Response } | null} Object with Response to return,
   *     or null if upgrade failed
   *
   * @example
   * // In Deno.serve() handler
   * Deno.serve((req) => {
   *     if (new URL(req.url).pathname === '/ws') {
   *         const result = wss.handleUpgrade(req, null, null, (ws) => {
   *             console.log('WebSocket ready')
   *         })
   *
   *         if (result) {
   *             return result.response
   *         }
   *         return new Response('Upgrade failed', { status: 500 })
   *     }
   *
   *     return new Response('Not found', { status: 404 })
   * })
   *
   * @example
   * // Without callback (use 'connection' event instead)
   * wss.on('connection', (ws, req) => {
   *     console.log('Client connected from:', req.url)
   * })
   *
   * Deno.serve((req) => {
   *     if (shouldUpgrade(req)) {
   *         const result = wss.handleUpgrade(req)
   *         return result?.response || new Response('Failed', { status: 500 })
   *     }
   *     return new Response('Hello')
   * })
   */
  handleUpgrade(req, _socket, _head, callback) {
    // Check for upgrade header
    const upgrade = req.headers.get("upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return null;
    }

    try {
      // Use Deno's built-in upgrade mechanism
      const { socket: denoSocket, response } = Deno.upgradeWebSocket(req);

      // Wrap with our adapter for ws-compatible API
      const wrapper = new DenoWebSocket(denoSocket);
      this._clients.add(wrapper);

      // Remove from clients set when connection closes
      wrapper.on("close", () => {
        this._clients.delete(wrapper);
      });

      // Invoke callback if provided
      if (callback) {
        callback(wrapper);
      }

      // Emit connection event for ws library compatibility
      this.emit("connection", wrapper, req);

      // Return the response for Deno's handler to return
      return { response };
    } catch (err) {
      console.error("[api-ape] Deno WebSocket upgrade failed:", err);
      return null;
    }
  }

  /**
   * Close the server and all active connections.
   *
   * Sends a close frame with code 1001 (Going Away) and reason
   * "Server shutting down" to all connected clients, then clears
   * the clients set.
   *
   * @param {Function} [callback] - Called after all connections are closed
   *
   * @example
   * // Graceful shutdown
   * wss.close(() => {
   *     console.log('All WebSocket connections closed')
   *     Deno.exit(0)
   * })
   *
   * @example
   * // Shutdown with notification
   * for (const client of wss.clients) {
   *     client.send(JSON.stringify({ type: 'shutdown', message: 'Server restarting' }))
   * }
   *
   * setTimeout(() => {
   *     wss.close(() => console.log('Shutdown complete'))
   * }, 1000)
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

module.exports = {
  /**
   * DenoWebSocket class - ws-compatible wrapper for Deno WebSocket.
   * @type {typeof DenoWebSocket}
   */
  DenoWebSocket,

  /**
   * DenoWebSocketServer class - ws-compatible server for Deno.
   * @type {typeof DenoWebSocketServer}
   */
  DenoWebSocketServer,
};
