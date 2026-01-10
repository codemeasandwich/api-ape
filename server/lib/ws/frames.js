/**
 * @fileoverview RFC 6455 WebSocket Frame Encoding/Decoding
 *
 * This module implements the WebSocket frame protocol as defined in RFC 6455.
 * It provides low-level functions for parsing incoming frames from clients
 * and building outgoing frames to send to clients.
 *
 * WebSocket Frame Structure (RFC 6455 Section 5.2):
 * ```
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-------+-+-------------+-------------------------------+
 * |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 * |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 * |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 * | |1|2|3|       |K|             |                               |
 * +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 * |     Extended payload length continued, if payload len == 127  |
 * + - - - - - - - - - - - - - - - +-------------------------------+
 * |                               |Masking-key, if MASK set to 1  |
 * +-------------------------------+-------------------------------+
 * | Masking-key (continued)       |          Payload Data         |
 * +-------------------------------- - - - - - - - - - - - - - - - +
 * :                     Payload Data continued ...                :
 * + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
 * |                     Payload Data continued ...                |
 * +---------------------------------------------------------------+
 * ```
 *
 * Key Points:
 * - FIN bit indicates if this is the final fragment
 * - Opcode identifies the frame type (text, binary, close, ping, pong)
 * - Client-to-server messages MUST be masked
 * - Server-to-client messages MUST NOT be masked
 * - Payload length can be 7 bits, 16 bits, or 64 bits
 *
 * @module server/lib/ws/frames
 * @see {@link https://tools.ietf.org/html/rfc6455#section-5} - RFC 6455 Data Framing
 * @see {@link module:server/lib/ws/socket} - WebSocket connection using these frames
 *
 * @example
 * // Parse an incoming frame
 * const { parseFrame, OPCODES } = require('./frames')
 *
 * const result = parseFrame(buffer)
 * if (result) {
 *     const { frame, bytesConsumed } = result
 *     if (frame.opcode === OPCODES.TEXT) {
 *         console.log('Text message:', frame.payload.toString())
 *     }
 * }
 *
 * @example
 * // Build an outgoing text frame
 * const { buildFrame, OPCODES } = require('./frames')
 *
 * const frame = buildFrame('Hello, World!', OPCODES.TEXT)
 * socket.write(frame)
 *
 * @example
 * // Handle WebSocket handshake
 * const { generateAcceptKey } = require('./frames')
 *
 * const clientKey = req.headers['sec-websocket-key']
 * const acceptKey = generateAcceptKey(clientKey)
 * // Use acceptKey in Sec-WebSocket-Accept header
 */

const crypto = require("crypto");

/**
 * WebSocket GUID for handshake as defined in RFC 6455 Section 1.3.
 * This magic string is concatenated with the client's key to generate
 * the accept key for the handshake response.
 *
 * @private
 * @constant {string}
 */
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/**
 * WebSocket frame opcodes as defined in RFC 6455 Section 5.2.
 *
 * Opcodes identify the interpretation of the payload data:
 * - **Data frames** (0x01, 0x02): Carry application data
 * - **Control frames** (0x08-0x0A): Used for protocol-level signaling
 * - **Continuation** (0x00): Continues a fragmented message
 *
 * @readonly
 * @enum {number}
 * @property {number} CONTINUATION - Continuation frame for fragmented messages (0x00)
 * @property {number} TEXT - Text data frame, payload is UTF-8 text (0x01)
 * @property {number} BINARY - Binary data frame, payload is arbitrary bytes (0x02)
 * @property {number} CLOSE - Connection close frame (0x08)
 * @property {number} PING - Ping frame for keepalive/latency check (0x09)
 * @property {number} PONG - Pong frame, response to ping (0x0A)
 *
 * @example
 * // Check frame type
 * if (frame.opcode === OPCODES.TEXT) {
 *     const message = frame.payload.toString('utf8')
 * } else if (frame.opcode === OPCODES.BINARY) {
 *     const buffer = frame.payload
 * } else if (frame.opcode === OPCODES.CLOSE) {
 *     const { code, reason } = parseClosePayload(frame.payload)
 * }
 *
 * @example
 * // Build different frame types
 * buildFrame('Hello', OPCODES.TEXT)    // Text frame
 * buildFrame(buffer, OPCODES.BINARY)   // Binary frame
 * buildCloseFrame(1000, 'Goodbye')     // Close frame
 * buildPongFrame(pingPayload)          // Pong frame
 */
const OPCODES = {
  /** Continuation frame (0x00) - continues a fragmented message */
  CONTINUATION: 0x00,
  /** Text frame (0x01) - UTF-8 encoded text data */
  TEXT: 0x01,
  /** Binary frame (0x02) - arbitrary binary data */
  BINARY: 0x02,
  /** Close frame (0x08) - initiates connection close */
  CLOSE: 0x08,
  /** Ping frame (0x09) - keepalive/latency request */
  PING: 0x09,
  /** Pong frame (0x0A) - response to ping */
  PONG: 0x0a,
};

/**
 * Generates the Sec-WebSocket-Accept header value for the handshake.
 *
 * As specified in RFC 6455 Section 1.3, the accept key is computed by:
 * 1. Concatenating the client's key with the WebSocket GUID
 * 2. Taking the SHA-1 hash of the result
 * 3. Base64 encoding the hash
 *
 * This proves to the client that the server understands WebSocket protocol
 * and isn't just echoing back HTTP headers.
 *
 * @function generateAcceptKey
 * @param {string} clientKey - The Sec-WebSocket-Key header from the client.
 *     Must be a base64-encoded 16-byte value (24 characters with padding).
 * @returns {string} The base64-encoded SHA-1 hash for Sec-WebSocket-Accept header
 *
 * @example
 * // In HTTP upgrade handler
 * const clientKey = req.headers['sec-websocket-key']
 * const acceptKey = generateAcceptKey(clientKey)
 *
 * const response = [
 *     'HTTP/1.1 101 Switching Protocols',
 *     'Upgrade: websocket',
 *     'Connection: Upgrade',
 *     `Sec-WebSocket-Accept: ${acceptKey}`,
 *     '', ''
 * ].join('\r\n')
 *
 * socket.write(response)
 *
 * @example
 * // Test vector from RFC 6455 Section 1.3
 * const clientKey = 'dGhlIHNhbXBsZSBub25jZQ=='
 * const acceptKey = generateAcceptKey(clientKey)
 * // acceptKey === 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
 */
function generateAcceptKey(clientKey) {
  return crypto
    .createHash("sha1")
    .update(clientKey + WS_GUID)
    .digest("base64");
}

/**
 * Unmasks payload data from a client frame.
 *
 * Per RFC 6455, all frames sent from client to server MUST be masked.
 * The masking algorithm XORs each byte of the payload with a byte from
 * the 4-byte masking key, cycling through the key bytes.
 *
 * Algorithm: `unmasked[i] = masked[i] XOR maskKey[i % 4]`
 *
 * @function unmaskPayload
 * @param {Buffer} payload - The masked payload data
 * @param {Buffer} maskKey - 4-byte masking key from the frame header
 * @returns {Buffer} The unmasked payload data
 *
 * @example
 * // Unmask payload from a parsed frame
 * const maskKey = buffer.slice(offset, offset + 4)
 * const maskedPayload = buffer.slice(offset + 4, offset + 4 + length)
 * const payload = unmaskPayload(maskedPayload, maskKey)
 *
 * @example
 * // Manual unmasking example
 * const maskKey = Buffer.from([0x37, 0xfa, 0x21, 0x3d])
 * const masked = Buffer.from([0x7f, 0x9f, 0x4d, 0x51, 0x58])
 * const unmasked = unmaskPayload(masked, maskKey)
 * // unmasked.toString() === 'Hello'
 */
function unmaskPayload(payload, maskKey) {
  const result = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    result[i] = payload[i] ^ maskKey[i & 3]; // i & 3 === i % 4, but faster
  }
  return result;
}

/**
 * @typedef {Object} ParsedFrame
 * Result from parsing a WebSocket frame.
 *
 * @property {boolean} fin - True if this is the final fragment of a message
 * @property {number} opcode - Frame opcode (see OPCODES)
 * @property {Buffer} payload - The frame's payload data (unmasked)
 */

/**
 * @typedef {Object} ParseFrameResult
 * Result from parseFrame function.
 *
 * @property {ParsedFrame} frame - The parsed frame data
 * @property {number} bytesConsumed - Number of bytes consumed from the buffer
 */

/**
 * Parses a WebSocket frame from a buffer.
 *
 * This function handles the full complexity of WebSocket frame parsing:
 * - Variable-length payload (7-bit, 16-bit, or 64-bit length)
 * - Masked payloads (from clients) and unmasked (from servers)
 * - Returns null if the buffer doesn't contain a complete frame
 *
 * The function is designed to be called repeatedly as data arrives,
 * returning null until a complete frame is available.
 *
 * @function parseFrame
 * @param {Buffer} buffer - Buffer containing raw frame data
 * @returns {ParseFrameResult|null} Parsed frame and bytes consumed, or null if incomplete
 * @throws {Error} If payload length exceeds JavaScript's safe integer range
 *
 * @example
 * // Parse frames from incoming data
 * let buffer = Buffer.alloc(0)
 *
 * socket.on('data', (data) => {
 *     buffer = Buffer.concat([buffer, data])
 *
 *     while (buffer.length > 0) {
 *         const result = parseFrame(buffer)
 *         if (!result) break // Incomplete frame, wait for more data
 *
 *         handleFrame(result.frame)
 *         buffer = buffer.slice(result.bytesConsumed)
 *     }
 * })
 *
 * @example
 * // Frame structure breakdown
 * const result = parseFrame(buffer)
 * if (result) {
 *     const { frame, bytesConsumed } = result
 *     console.log('FIN:', frame.fin)           // Is final fragment?
 *     console.log('Opcode:', frame.opcode)     // Frame type
 *     console.log('Payload:', frame.payload)   // Unmasked data
 *     console.log('Consumed:', bytesConsumed)  // Bytes to remove from buffer
 * }
 */
function parseFrame(buffer) {
  // Need at least 2 bytes for the header
  if (buffer.length < 2) return null;

  let offset = 0;
  const firstByte = buffer[offset++];
  const secondByte = buffer[offset++];

  // Parse first byte: FIN (1 bit) + RSV1-3 (3 bits) + opcode (4 bits)
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;

  // Parse second byte: MASK (1 bit) + payload length (7 bits)
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;

  // Handle extended payload length
  if (payloadLength === 126) {
    // 16-bit length follows
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    // 64-bit length follows
    if (buffer.length < offset + 8) return null;

    // JavaScript can't handle full 64-bit integers safely
    // Check that high 32 bits are zero
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    if (high !== 0) {
      throw new Error("Payload too large");
    }
    payloadLength = low;
    offset += 8;
  }

  // Read masking key if present (4 bytes)
  let maskKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  // Read payload
  if (buffer.length < offset + payloadLength) return null;
  let payload = buffer.slice(offset, offset + payloadLength);
  offset += payloadLength;

  // Unmask payload if needed
  if (masked && maskKey) {
    payload = unmaskPayload(payload, maskKey);
  }

  return {
    frame: { fin, opcode, payload },
    bytesConsumed: offset,
  };
}

/**
 * Builds a WebSocket frame for sending to a client.
 *
 * Server-to-client frames are NEVER masked (per RFC 6455).
 * This function handles the frame header construction including
 * the appropriate payload length encoding.
 *
 * Payload length encoding:
 * - 0-125: Encoded in 7 bits of second byte
 * - 126-65535: Second byte = 126, followed by 16-bit length
 * - 65536+: Second byte = 127, followed by 64-bit length
 *
 * @function buildFrame
 * @param {Buffer|string} data - Payload data to send
 * @param {number} [opcode=OPCODES.TEXT] - Frame opcode (default: TEXT)
 * @param {boolean} [fin=true] - Whether this is the final fragment
 * @returns {Buffer} Complete WebSocket frame ready to send
 *
 * @example
 * // Send a text message
 * const frame = buildFrame('Hello, World!', OPCODES.TEXT)
 * socket.write(frame)
 *
 * @example
 * // Send binary data
 * const imageData = fs.readFileSync('image.png')
 * const frame = buildFrame(imageData, OPCODES.BINARY)
 * socket.write(frame)
 *
 * @example
 * // Send fragmented message
 * const frame1 = buildFrame('Hello, ', OPCODES.TEXT, false)  // Not final
 * const frame2 = buildFrame('World!', OPCODES.CONTINUATION, true)  // Final
 * socket.write(frame1)
 * socket.write(frame2)
 *
 * @example
 * // Frame structure for "Hi" (text)
 * // Byte 0: 0x81 (FIN=1, opcode=1)
 * // Byte 1: 0x02 (MASK=0, length=2)
 * // Bytes 2-3: "Hi"
 */
function buildFrame(data, opcode = OPCODES.TEXT, fin = true) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const payloadLength = payload.length;

  // Calculate header size based on payload length
  let headerSize = 2; // First two bytes
  let extendedLengthSize = 0;

  if (payloadLength > 65535) {
    extendedLengthSize = 8; // 64-bit length
  } else if (payloadLength > 125) {
    extendedLengthSize = 2; // 16-bit length
  }

  // Allocate buffer for complete frame
  const frame = Buffer.alloc(headerSize + extendedLengthSize + payloadLength);
  let offset = 0;

  // First byte: FIN bit + opcode
  frame[offset++] = (fin ? 0x80 : 0x00) | opcode;

  // Second byte: MASK bit (0 for server) + payload length
  if (payloadLength > 65535) {
    frame[offset++] = 127;
    // Write 64-bit length (high 32 bits = 0)
    frame.writeUInt32BE(0, offset);
    offset += 4;
    frame.writeUInt32BE(payloadLength, offset);
    offset += 4;
  } else if (payloadLength > 125) {
    frame[offset++] = 126;
    frame.writeUInt16BE(payloadLength, offset);
    offset += 2;
  } else {
    frame[offset++] = payloadLength;
  }

  // Copy payload (no masking for server -> client)
  payload.copy(frame, offset);

  return frame;
}

/**
 * Builds a WebSocket close frame.
 *
 * Close frames may contain a 2-byte status code followed by an optional
 * UTF-8 reason string. Common status codes (RFC 6455 Section 7.4.1):
 *
 * - 1000: Normal closure
 * - 1001: Going away (server shutting down, browser navigating away)
 * - 1002: Protocol error
 * - 1003: Unsupported data type
 * - 1006: Abnormal closure (connection lost, no close frame)
 * - 1007: Invalid payload data
 * - 1008: Policy violation
 * - 1009: Message too big
 * - 1011: Server error
 *
 * @function buildCloseFrame
 * @param {number} [code=1000] - Status code (1000 = normal closure)
 * @param {string} [reason=''] - Human-readable close reason
 * @returns {Buffer} Complete close frame ready to send
 *
 * @example
 * // Normal close
 * const frame = buildCloseFrame(1000, 'Goodbye')
 * socket.write(frame)
 *
 * @example
 * // Server shutting down
 * const frame = buildCloseFrame(1001, 'Server maintenance')
 * socket.write(frame)
 *
 * @example
 * // Protocol error
 * const frame = buildCloseFrame(1002, 'Invalid frame received')
 * socket.write(frame)
 */
function buildCloseFrame(code = 1000, reason = "") {
  const reasonBuffer = Buffer.from(reason);
  const payload = Buffer.alloc(2 + reasonBuffer.length);

  // Write 16-bit status code
  payload.writeUInt16BE(code, 0);

  // Write reason string
  reasonBuffer.copy(payload, 2);

  return buildFrame(payload, OPCODES.CLOSE);
}

/**
 * Builds a WebSocket pong frame in response to a ping.
 *
 * Pong frames MUST echo back the exact payload from the ping frame.
 * This is used for keepalive and latency measurement.
 *
 * @function buildPongFrame
 * @param {Buffer} data - Ping payload to echo back
 * @returns {Buffer} Complete pong frame ready to send
 *
 * @example
 * // Respond to ping
 * if (frame.opcode === OPCODES.PING) {
 *     const pong = buildPongFrame(frame.payload)
 *     socket.write(pong)
 * }
 *
 * @example
 * // Empty pong (valid)
 * const pong = buildPongFrame(Buffer.alloc(0))
 */
function buildPongFrame(data) {
  return buildFrame(data, OPCODES.PONG);
}

/**
 * @typedef {Object} ClosePayload
 * Parsed close frame payload.
 *
 * @property {number} code - Status code (1000-4999), or 1005 if not provided
 * @property {string} reason - Close reason string, or empty if not provided
 */

/**
 * Parses a close frame payload to extract status code and reason.
 *
 * Close frame payload structure:
 * - Bytes 0-1: 16-bit status code (optional)
 * - Bytes 2+: UTF-8 reason string (optional)
 *
 * If the payload is empty or less than 2 bytes, returns code 1005
 * (No Status Received) as specified in RFC 6455 Section 7.4.1.
 *
 * @function parseClosePayload
 * @param {Buffer} payload - Close frame payload
 * @returns {ClosePayload} Parsed status code and reason
 *
 * @example
 * // Parse close frame
 * if (frame.opcode === OPCODES.CLOSE) {
 *     const { code, reason } = parseClosePayload(frame.payload)
 *     console.log(`Connection closed: ${code} - ${reason}`)
 * }
 *
 * @example
 * // Handle different close codes
 * const { code, reason } = parseClosePayload(payload)
 * switch (code) {
 *     case 1000:
 *         console.log('Normal closure')
 *         break
 *     case 1001:
 *         console.log('Client going away')
 *         break
 *     case 1005:
 *         console.log('No status code received')
 *         break
 *     default:
 *         console.log(`Closed with code ${code}: ${reason}`)
 * }
 */
function parseClosePayload(payload) {
  if (payload.length >= 2) {
    return {
      code: payload.readUInt16BE(0),
      reason: payload.slice(2).toString("utf8"),
    };
  }
  // No status code provided
  return { code: 1005, reason: "" };
}

module.exports = {
  /**
   * WebSocket frame opcodes.
   * @type {Object}
   */
  OPCODES,

  /**
   * Generate Sec-WebSocket-Accept header value.
   * @function
   */
  generateAcceptKey,

  /**
   * Parse a WebSocket frame from a buffer.
   * @function
   */
  parseFrame,

  /**
   * Build a WebSocket frame for sending.
   * @function
   */
  buildFrame,

  /**
   * Build a close frame with status code and reason.
   * @function
   */
  buildCloseFrame,

  /**
   * Build a pong frame echoing ping payload.
   * @function
   */
  buildPongFrame,

  /**
   * Parse close frame payload.
   * @function
   */
  parseClosePayload,

  /**
   * Unmask payload data from client frames.
   * @function
   */
  unmaskPayload,
};
