/**
 * @fileoverview WebSocket Polyfill Entry Point
 *
 * This module provides a pure JavaScript WebSocket implementation that is
 * compatible with the popular `ws` library API. It serves as a fallback
 * when native WebSocket support is not available or when running in
 * environments without the `ws` package installed.
 *
 * The implementation is fully RFC 6455 compliant and includes:
 * - **WebSocketServer**: Server-side WebSocket handling with HTTP upgrade
 * - **WebSocket**: Client/connection wrapper with frame protocol
 * - **Frame encoding/decoding**: Binary frame parsing and building
 * - **Control frames**: Ping, pong, and close frame handling
 *
 * Why a Polyfill?
 * - Zero external dependencies for WebSocket support
 * - Consistent behavior across Node.js versions
 * - Works in environments where `ws` package can't be installed
 * - Lightweight alternative for simple use cases
 *
 * API Compatibility:
 * The exported classes are designed to be drop-in replacements for the
 * `ws` library, supporting the same patterns:
 * - `new WebSocketServer({ noServer: true })`
 * - `wss.handleUpgrade(req, socket, head, callback)`
 * - `wss.on('connection', (ws, req) => { ... })`
 * - `ws.send(data)`, `ws.close(code, reason)`
 * - `ws.on('message', handler)`, `ws.on('close', handler)`
 *
 * @module server/lib/ws
 * @see {@link module:server/lib/ws/server} - WebSocketServer implementation
 * @see {@link module:server/lib/ws/socket} - WebSocket connection wrapper
 * @see {@link module:server/lib/ws/frames} - Frame encoding/decoding
 * @see {@link https://tools.ietf.org/html/rfc6455} - RFC 6455 WebSocket Protocol
 *
 * @example
 * // Basic server setup
 * const { WebSocketServer } = require('./ws')
 *
 * const wss = new WebSocketServer({ noServer: true })
 *
 * wss.on('connection', (ws, req) => {
 *     console.log('Client connected')
 *
 *     ws.on('message', (data) => {
 *         console.log('Received:', data.toString())
 *         ws.send('Echo: ' + data.toString())
 *     })
 *
 *     ws.on('close', () => {
 *         console.log('Client disconnected')
 *     })
 * })
 *
 * @example
 * // Integration with HTTP server
 * const http = require('http')
 * const { WebSocketServer } = require('./ws')
 *
 * const server = http.createServer()
 * const wss = new WebSocketServer({ noServer: true })
 *
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
 * server.listen(8080)
 *
 * @example
 * // Using OPCODES for custom frame handling
 * const { OPCODES } = require('./ws')
 *
 * console.log(OPCODES.TEXT)   // 0x01
 * console.log(OPCODES.BINARY) // 0x02
 * console.log(OPCODES.CLOSE)  // 0x08
 * console.log(OPCODES.PING)   // 0x09
 * console.log(OPCODES.PONG)   // 0x0A
 */

const { WebSocketServer } = require("./server");
const { WebSocket, READY_STATES } = require("./socket");
const { OPCODES } = require("./frames");

/**
 * WebSocket ready state constants.
 *
 * These constants represent the possible states of a WebSocket connection,
 * matching the standard WebSocket API.
 *
 * @type {Object}
 * @property {number} CONNECTING - Connection is being established (0)
 * @property {number} OPEN - Connection is open and ready to communicate (1)
 * @property {number} CLOSING - Connection is in the process of closing (2)
 * @property {number} CLOSED - Connection is closed (3)
 *
 * @example
 * if (ws.readyState === READY_STATES.OPEN) {
 *     ws.send('Hello')
 * }
 *
 * @example
 * switch (ws.readyState) {
 *     case READY_STATES.CONNECTING:
 *         console.log('Connecting...')
 *         break
 *     case READY_STATES.OPEN:
 *         console.log('Connected!')
 *         break
 *     case READY_STATES.CLOSING:
 *         console.log('Closing...')
 *         break
 *     case READY_STATES.CLOSED:
 *         console.log('Closed')
 *         break
 * }
 */

/**
 * WebSocket frame opcodes as defined in RFC 6455.
 *
 * These opcodes identify the type of each WebSocket frame:
 * - Data frames: TEXT (0x01), BINARY (0x02)
 * - Control frames: CLOSE (0x08), PING (0x09), PONG (0x0A)
 * - CONTINUATION (0x00) for fragmented messages
 *
 * @type {Object}
 * @property {number} CONTINUATION - Continuation frame (0x00)
 * @property {number} TEXT - Text data frame (0x01)
 * @property {number} BINARY - Binary data frame (0x02)
 * @property {number} CLOSE - Connection close frame (0x08)
 * @property {number} PING - Ping frame (0x09)
 * @property {number} PONG - Pong frame (0x0A)
 *
 * @example
 * const { OPCODES, buildFrame } = require('./ws/frames')
 *
 * // Build a text frame
 * const textFrame = buildFrame('Hello', OPCODES.TEXT)
 *
 * // Build a binary frame
 * const binaryFrame = buildFrame(buffer, OPCODES.BINARY)
 */

module.exports = {
  /**
   * WebSocket server class for handling WebSocket connections.
   *
   * Handles HTTP upgrade requests and manages connected clients.
   * Compatible with the `ws` library's WebSocketServer API.
   *
   * @type {typeof import('./server').WebSocketServer}
   *
   * @example
   * const wss = new WebSocketServer({ noServer: true })
   *
   * wss.on('connection', (ws, req) => {
   *     console.log('New connection from:', req.socket.remoteAddress)
   * })
   *
   * // Get all connected clients
   * console.log('Connected clients:', wss.clients.size)
   */
  WebSocketServer,

  /**
   * WebSocket connection class wrapping a TCP socket.
   *
   * Provides the standard WebSocket interface for sending/receiving
   * messages and handling connection events.
   *
   * @type {typeof import('./socket').WebSocket}
   *
   * @example
   * // WebSocket is typically created by WebSocketServer.handleUpgrade()
   * wss.handleUpgrade(req, socket, head, (ws) => {
   *     ws.send('Welcome!')
   *
   *     ws.on('message', (data) => {
   *         console.log('Received:', data)
   *     })
   *
   *     ws.on('close', (code, reason) => {
   *         console.log('Closed:', code, reason)
   *     })
   *
   *     ws.on('error', (err) => {
   *         console.error('Error:', err)
   *     })
   * })
   */
  WebSocket,

  /**
   * WebSocket ready state constants.
   *
   * @type {{ CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }}
   */
  READY_STATES,

  /**
   * WebSocket frame opcode constants.
   *
   * @type {{ CONTINUATION: 0x00, TEXT: 0x01, BINARY: 0x02, CLOSE: 0x08, PING: 0x09, PONG: 0x0A }}
   */
  OPCODES,
};
