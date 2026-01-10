/**
 * @fileoverview WebSocket Connection Class - TCP Socket with Frame Protocol
 *
 * This module provides a WebSocket connection wrapper that handles the
 * WebSocket frame protocol over a raw TCP socket. It implements the
 * ws library compatible interface for sending/receiving messages.
 *
 * ## Features
 *
 * - **Frame Protocol**: Automatic parsing and building of WebSocket frames
 * - **Message Fragmentation**: Handles fragmented messages transparently
 * - **Control Frames**: Responds to ping/pong and close frames
 * - **Event-Based**: EventEmitter interface for message, close, error events
 * - **Buffer Management**: Efficient buffering of partial frames
 *
 * ## Ready States
 *
 * The WebSocket connection goes through these states:
 * - `CONNECTING (0)`: Connection being established
 * - `OPEN (1)`: Connection is open and ready for communication
 * - `CLOSING (2)`: Close frame sent, waiting for response
 * - `CLOSED (3)`: Connection is fully closed
 *
 * ## Message Fragmentation
 *
 * Large messages may be split into multiple frames. The class handles this
 * by collecting continuation frames until the final frame (FIN bit set)
 * is received, then emitting the complete reassembled message.
 *
 * @module server/lib/ws/socket
 * @see {@link module:server/lib/ws/frames} - Frame encoding/decoding
 * @see {@link module:server/lib/ws/server} - WebSocketServer that creates these
 * @see {@link https://tools.ietf.org/html/rfc6455#section-5} - RFC 6455 Data Framing
 *
 * @example
 * // WebSocket is typically created by WebSocketServer.handleUpgrade()
 * wss.handleUpgrade(req, socket, head, (ws) => {
 *     // Send a message
 *     ws.send('Hello, client!')
 *
 *     // Handle incoming messages
 *     ws.on('message', (data) => {
 *         console.log('Received:', data.toString())
 *         ws.send('Echo: ' + data.toString())
 *     })
 *
 *     // Handle connection close
 *     ws.on('close', (code, reason) => {
 *         console.log(`Connection closed: ${code} ${reason}`)
 *     })
 *
 *     // Handle errors
 *     ws.on('error', (err) => {
 *         console.error('WebSocket error:', err)
 *     })
 * })
 *
 * @example
 * // Check ready state before sending
 * if (ws.readyState === ws.OPEN) {
 *     ws.send(JSON.stringify({ type: 'ping' }))
 * }
 *
 * @example
 * // Send binary data
 * const buffer = Buffer.from([0x01, 0x02, 0x03])
 * ws.send(buffer)  // Automatically uses BINARY opcode
 *
 * @example
 * // Graceful close with code and reason
 * ws.close(1000, 'Normal closure')
 */

const { EventEmitter } = require("events");
const {
  OPCODES,
  parseFrame,
  buildFrame,
  buildCloseFrame,
  buildPongFrame,
  parseClosePayload,
} = require("./frames");

/**
 * WebSocket ready state constants matching the W3C WebSocket API.
 *
 * These constants are also available as instance properties on WebSocket
 * for convenience (e.g., `ws.OPEN`).
 *
 * @readonly
 * @enum {number}
 * @property {number} CONNECTING - Socket is connecting (0)
 * @property {number} OPEN - Socket is open and ready (1)
 * @property {number} CLOSING - Socket is closing (2)
 * @property {number} CLOSED - Socket is closed (3)
 *
 * @example
 * const { READY_STATES } = require('./socket')
 *
 * if (ws.readyState === READY_STATES.OPEN) {
 *     ws.send('Hello!')
 * } else if (ws.readyState === READY_STATES.CLOSED) {
 *     console.log('Cannot send, connection closed')
 * }
 */
const READY_STATES = {
  /** Connection is being established */
  CONNECTING: 0,
  /** Connection is open and ready for communication */
  OPEN: 1,
  /** Connection is in the process of closing */
  CLOSING: 2,
  /** Connection has been closed */
  CLOSED: 3,
};

/**
 * WebSocket connection class that wraps a TCP socket with the WebSocket frame protocol.
 *
 * This class handles:
 * - Parsing incoming WebSocket frames from the TCP stream
 * - Building outgoing frames for sending messages
 * - Message fragmentation and reassembly
 * - Control frame handling (ping/pong/close)
 * - Connection state management
 *
 * ## Events
 *
 * | Event     | Arguments           | Description                           |
 * |-----------|---------------------|---------------------------------------|
 * | `message` | `(data: Buffer)`    | Received a complete message           |
 * | `close`   | `(code?, reason?)`  | Connection was closed                 |
 * | `error`   | `(err: Error)`      | An error occurred                     |
 *
 * ## Automatic Behaviors
 *
 * - **Ping Response**: Automatically responds to ping frames with pong
 * - **Close Handshake**: Responds to close frames and terminates connection
 * - **Fragment Assembly**: Collects continuation frames into complete messages
 *
 * @class WebSocket
 * @extends EventEmitter
 *
 * @param {net.Socket} socket - The underlying TCP socket (after HTTP upgrade)
 *
 * @fires WebSocket#message When a complete message is received
 * @fires WebSocket#close When the connection is closed
 * @fires WebSocket#error When an error occurs
 *
 * @example
 * // Creating a WebSocket (usually done by WebSocketServer)
 * const ws = new WebSocket(tcpSocket)
 *
 * ws.on('message', (data) => {
 *     const message = data.toString()
 *     console.log('Received:', message)
 * })
 *
 * ws.on('close', () => {
 *     console.log('Connection closed')
 * })
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new WebSocket connection wrapper.
   *
   * The socket should be a TCP socket that has already completed the
   * WebSocket handshake (HTTP 101 Switching Protocols response sent).
   *
   * @param {net.Socket} socket - TCP socket after WebSocket handshake
   *
   * @example
   * // After HTTP upgrade handshake
   * const ws = new WebSocket(tcpSocket)
   */
  constructor(socket) {
    super();

    /**
     * The underlying TCP socket.
     * @type {net.Socket}
     * @private
     */
    this._socket = socket;

    /**
     * Current connection state.
     * @type {number}
     * @private
     */
    this._readyState = READY_STATES.OPEN;

    /**
     * Buffer for incomplete frame data.
     * Accumulates bytes until a complete frame can be parsed.
     * @type {Buffer}
     * @private
     */
    this._buffer = Buffer.alloc(0);

    /**
     * Array of payload buffers for fragmented messages.
     * Fragments are accumulated here until the final frame.
     * @type {Buffer[]}
     * @private
     */
    this._fragments = [];

    /**
     * Opcode of the first frame in a fragmented message.
     * Used to determine message type when reassembling.
     * @type {number|null}
     * @private
     */
    this._fragmentOpcode = null;

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

    // Set up event listeners on the underlying socket
    this._setupSocketListeners();
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
   *         console.log('Connected and ready')
   *         ws.send('Hello!')
   *         break
   *     case ws.CLOSING:
   *         console.log('Connection closing...')
   *         break
   *     case ws.CLOSED:
   *         console.log('Connection closed')
   *         break
   * }
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * Send data to the remote endpoint.
   *
   * The data type determines the frame opcode:
   * - `Buffer` → Binary frame (opcode 0x02)
   * - `string` → Text frame (opcode 0x01)
   *
   * The data is automatically wrapped in a WebSocket frame before sending.
   *
   * @param {string|Buffer} data - The data to send
   * @throws {Error} If the WebSocket is not in the OPEN state
   *
   * @example
   * // Send text data
   * ws.send('Hello, World!')
   *
   * @example
   * // Send JSON
   * ws.send(JSON.stringify({ type: 'message', text: 'Hi!' }))
   *
   * @example
   * // Send binary data
   * const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04])
   * ws.send(buffer)
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

    // Determine opcode based on data type
    const opcode = Buffer.isBuffer(data) ? OPCODES.BINARY : OPCODES.TEXT;

    // Build frame and send to socket
    this._socket.write(buildFrame(data, opcode));
  }

  /**
   * Initiate a graceful close of the WebSocket connection.
   *
   * Sends a close frame to the remote endpoint and waits briefly for
   * the close handshake to complete. If the handshake doesn't complete
   * within 100ms, the socket is forcibly destroyed.
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
   * ws.close(1008, 'Invalid message format')
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

    // Transition to CLOSING state
    this._readyState = READY_STATES.CLOSING;

    // Send close frame
    this._socket.write(buildCloseFrame(code, reason));

    // Force close after timeout if handshake doesn't complete
    setTimeout(() => {
      if (this._readyState !== READY_STATES.CLOSED) {
        this._socket.destroy();
      }
    }, 100);
  }

  /**
   * Set up event listeners on the underlying TCP socket.
   *
   * Listens for:
   * - `data`: Incoming bytes to parse as WebSocket frames
   * - `close`: Socket closure to update state and emit close event
   * - `error`: Socket errors to forward to WebSocket error event
   *
   * @private
   */
  _setupSocketListeners() {
    this._socket.on("data", (data) => this._handleData(data));

    this._socket.on("close", () => {
      this._readyState = READY_STATES.CLOSED;
      this.emit("close");
    });

    this._socket.on("error", (err) => this.emit("error", err));
  }

  /**
   * Handle incoming data from the TCP socket.
   *
   * Appends received data to the internal buffer and attempts to
   * parse complete WebSocket frames. Continues parsing frames
   * until the buffer doesn't contain a complete frame.
   *
   * @param {Buffer} data - Raw bytes received from the socket
   * @private
   */
  _handleData(data) {
    // Append to buffer
    this._buffer = Buffer.concat([this._buffer, data]);

    // Parse frames until buffer is exhausted
    while (this._buffer.length > 0) {
      const result = parseFrame(this._buffer);

      // Not enough data for a complete frame
      if (!result) break;

      // Remove consumed bytes from buffer
      this._buffer = this._buffer.slice(result.bytesConsumed);

      // Process the frame
      this._handleFrame(result.frame);
    }
  }

  /**
   * Handle a parsed WebSocket frame.
   *
   * Routes the frame to the appropriate handler based on its opcode:
   * - TEXT/BINARY: Data frames, emitted as messages
   * - CONTINUATION: Fragment continuation
   * - CLOSE: Connection close request
   * - PING: Keepalive request (auto-responds with pong)
   * - PONG: Keepalive response (ignored)
   *
   * @param {Object} frame - Parsed frame object
   * @param {boolean} frame.fin - True if this is the final fragment
   * @param {number} frame.opcode - Frame type opcode
   * @param {Buffer} frame.payload - Frame payload data
   * @private
   */
  _handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OPCODES.CONTINUATION:
        this._handleContinuation(fin, payload);
        break;

      case OPCODES.TEXT:
      case OPCODES.BINARY:
        if (fin) {
          // Complete single-frame message
          this.emit("message", payload);
        } else {
          // First frame of fragmented message
          this._fragments = [payload];
          this._fragmentOpcode = opcode;
        }
        break;

      case OPCODES.CLOSE:
        this._handleClose(payload);
        break;

      case OPCODES.PING:
        this._handlePing(payload);
        break;

      case OPCODES.PONG:
        // Pong frames are silently ignored
        break;

      default:
        // Unknown opcode - close with protocol error
        this.close(1002, "Unknown opcode");
    }
  }

  /**
   * Handle a continuation frame for fragmented messages.
   *
   * Accumulates fragment payloads until the final frame (FIN=1)
   * is received, then concatenates all fragments and emits
   * the complete message.
   *
   * @param {boolean} fin - True if this is the final fragment
   * @param {Buffer} payload - Fragment payload
   * @private
   */
  _handleContinuation(fin, payload) {
    // Continuation without a starting frame is an error
    if (!this._fragmentOpcode) {
      this.close(1002, "Unexpected continuation");
      return;
    }

    // Add fragment to collection
    this._fragments.push(payload);

    // If final fragment, reassemble and emit
    if (fin) {
      this.emit("message", Buffer.concat(this._fragments));
      this._fragments = [];
      this._fragmentOpcode = null;
    }
  }

  /**
   * Handle a close frame from the remote endpoint.
   *
   * Implements the close handshake:
   * - If we're OPEN: Send close response and terminate
   * - If we're CLOSING: We initiated, just terminate
   *
   * @param {Buffer} payload - Close frame payload (may contain code + reason)
   * @private
   */
  _handleClose(payload) {
    const { code } = parseClosePayload(payload);

    if (this._readyState === READY_STATES.OPEN) {
      // Remote initiated close - respond and terminate
      this._readyState = READY_STATES.CLOSING;
      this._socket.write(buildCloseFrame(code), () => this._socket.destroy());
    } else {
      // We initiated close - just terminate
      this._socket.destroy();
    }

    this._readyState = READY_STATES.CLOSED;
  }

  /**
   * Handle a ping frame by sending a pong response.
   *
   * Per RFC 6455, the pong frame must echo the ping's payload.
   * Only responds if the connection is still open.
   *
   * @param {Buffer} payload - Ping payload to echo in pong
   * @private
   */
  _handlePing(payload) {
    if (this._readyState === READY_STATES.OPEN) {
      this._socket.write(buildPongFrame(payload));
    }
  }
}

/**
 * Message event - emitted when a complete message is received.
 *
 * @event WebSocket#message
 * @type {Buffer}
 *
 * @example
 * ws.on('message', (data) => {
 *     // data is always a Buffer
 *     const text = data.toString('utf8')
 *     console.log('Received:', text)
 * })
 */

/**
 * Close event - emitted when the connection is closed.
 *
 * @event WebSocket#close
 *
 * @example
 * ws.on('close', () => {
 *     console.log('Connection closed')
 *     // Clean up resources
 * })
 */

/**
 * Error event - emitted when an error occurs.
 *
 * @event WebSocket#error
 * @type {Error}
 *
 * @example
 * ws.on('error', (err) => {
 *     console.error('WebSocket error:', err.message)
 * })
 */

module.exports = { WebSocket, READY_STATES };
