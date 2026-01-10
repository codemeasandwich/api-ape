/**
 * RFC 6455 WebSocket Frame Encoding/Decoding
 * @module server/lib/ws/frames
 */

const crypto = require('crypto')

// WebSocket GUID for handshake (RFC 6455 Section 1.3)
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

// Opcodes
const OPCODES = {
    CONTINUATION: 0x00,
    TEXT: 0x01,
    BINARY: 0x02,
    CLOSE: 0x08,
    PING: 0x09,
    PONG: 0x0A
}

/** Generate Sec-WebSocket-Accept header value from client key */
function generateAcceptKey(clientKey) {
    return crypto.createHash('sha1').update(clientKey + WS_GUID).digest('base64')
}

/**
 * Unmask payload data (client → server messages are always masked)
 * @param {Buffer} payload - The masked payload
 * @param {Buffer} maskKey - 4-byte mask key
 * @returns {Buffer} Unmasked payload
 */
function unmaskPayload(payload, maskKey) {
    const result = Buffer.alloc(payload.length)
    for (let i = 0; i < payload.length; i++) {
        result[i] = payload[i] ^ maskKey[i & 3]
    }
    return result
}

/**
 * Parse a WebSocket frame from buffer
 * @param {Buffer} buffer - Raw data buffer
 * @returns {{ frame: Object, bytesConsumed: number } | null} Parsed frame or null if incomplete
 */
function parseFrame(buffer) {
    if (buffer.length < 2) return null

    let offset = 0
    const firstByte = buffer[offset++]
    const secondByte = buffer[offset++]

    const fin = (firstByte & 0x80) !== 0
    const opcode = firstByte & 0x0F
    const masked = (secondByte & 0x80) !== 0
    let payloadLength = secondByte & 0x7F

    // Extended payload length
    if (payloadLength === 126) {
        if (buffer.length < offset + 2) return null
        payloadLength = buffer.readUInt16BE(offset)
        offset += 2
    } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) return null
        // JavaScript can't handle full 64-bit, use lower 32 bits
        const high = buffer.readUInt32BE(offset)
        const low = buffer.readUInt32BE(offset + 4)
        if (high !== 0) {
            throw new Error('Payload too large')
        }
        payloadLength = low
        offset += 8
    }

    // Mask key (4 bytes, only if masked)
    let maskKey = null
    if (masked) {
        if (buffer.length < offset + 4) return null
        maskKey = buffer.slice(offset, offset + 4)
        offset += 4
    }

    // Payload
    if (buffer.length < offset + payloadLength) return null
    let payload = buffer.slice(offset, offset + payloadLength)
    offset += payloadLength

    // Unmask if needed
    if (masked && maskKey) {
        payload = unmaskPayload(payload, maskKey)
    }

    return {
        frame: { fin, opcode, payload },
        bytesConsumed: offset
    }
}

/**
 * Build a WebSocket frame
 * Server → client frames are never masked (per RFC 6455)
 * @param {Buffer|string} data - Payload data
 * @param {number} opcode - Frame opcode
 * @param {boolean} fin - Is this the final frame?
 * @returns {Buffer} Complete frame buffer
 */
function buildFrame(data, opcode = OPCODES.TEXT, fin = true) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const payloadLength = payload.length

    // Calculate header size
    let headerSize = 2 // First two bytes
    let extendedLengthSize = 0

    if (payloadLength > 65535) {
        extendedLengthSize = 8
    } else if (payloadLength > 125) {
        extendedLengthSize = 2
    }

    const frame = Buffer.alloc(headerSize + extendedLengthSize + payloadLength)
    let offset = 0

    // First byte: FIN + opcode
    frame[offset++] = (fin ? 0x80 : 0x00) | opcode

    // Second byte: mask bit (0) + payload length
    if (payloadLength > 65535) {
        frame[offset++] = 127
        // Write 64-bit length (high 32 bits = 0)
        frame.writeUInt32BE(0, offset)
        offset += 4
        frame.writeUInt32BE(payloadLength, offset)
        offset += 4
    } else if (payloadLength > 125) {
        frame[offset++] = 126
        frame.writeUInt16BE(payloadLength, offset)
        offset += 2
    } else {
        frame[offset++] = payloadLength
    }

    // Payload (no masking for server → client)
    payload.copy(frame, offset)

    return frame
}

/**
 * Build a close frame with optional status code and reason
 * @param {number} code - Status code (1000 = normal)
 * @param {string} reason - Close reason
 * @returns {Buffer} Close frame
 */
function buildCloseFrame(code = 1000, reason = '') {
    const reasonBuffer = Buffer.from(reason)
    const payload = Buffer.alloc(2 + reasonBuffer.length)
    payload.writeUInt16BE(code, 0)
    reasonBuffer.copy(payload, 2)
    return buildFrame(payload, OPCODES.CLOSE)
}

/**
 * Build a pong frame in response to ping
 * @param {Buffer} data - Ping payload to echo back
 * @returns {Buffer} Pong frame
 */
function buildPongFrame(data) {
    return buildFrame(data, OPCODES.PONG)
}

/**
 * Parse close frame payload
 * @param {Buffer} payload - Close frame payload
 * @returns {{ code: number, reason: string }}
 */
function parseClosePayload(payload) {
    if (payload.length >= 2) {
        return {
            code: payload.readUInt16BE(0),
            reason: payload.slice(2).toString('utf8')
        }
    }
    return { code: 1005, reason: '' }
}

module.exports = {
    OPCODES,
    generateAcceptKey,
    parseFrame,
    buildFrame,
    buildCloseFrame,
    buildPongFrame,
    parseClosePayload,
    unmaskPayload
}
