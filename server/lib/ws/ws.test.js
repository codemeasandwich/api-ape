/**
 * Tests for WebSocket polyfill (RFC 6455 implementation)
 */

const {
    OPCODES,
    generateAcceptKey,
    parseFrame,
    buildFrame,
    buildCloseFrame,
    buildPongFrame,
    parseClosePayload,
    unmaskPayload
} = require('./frames')

describe('frames.js', () => {
    describe('generateAcceptKey', () => {
        it('should generate correct accept key per RFC 6455', () => {
            // Test vector from RFC 6455 Section 1.3
            const clientKey = 'dGhlIHNhbXBsZSBub25jZQ=='
            const expected = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
            expect(generateAcceptKey(clientKey)).toBe(expected)
        })

        it('should generate base64 output', () => {
            const key = generateAcceptKey('test123456789012345678==')
            expect(key).toMatch(/^[A-Za-z0-9+/]+=*$/)
        })
    })

    describe('unmaskPayload', () => {
        it('should unmask payload with XOR', () => {
            const maskKey = Buffer.from([0x37, 0xfa, 0x21, 0x3d])
            const maskedPayload = Buffer.from([0x7f, 0x9f, 0x4d, 0x51, 0x58])
            const unmasked = unmaskPayload(maskedPayload, maskKey)
            expect(unmasked.toString()).toBe('Hello')
        })

        it('should handle empty payload', () => {
            const maskKey = Buffer.from([0x00, 0x00, 0x00, 0x00])
            const unmasked = unmaskPayload(Buffer.alloc(0), maskKey)
            expect(unmasked.length).toBe(0)
        })
    })

    describe('parseFrame', () => {
        it('should return null for incomplete frame', () => {
            expect(parseFrame(Buffer.from([0x81]))).toBeNull()
        })

        it('should parse simple text frame', () => {
            // Build a masked frame from client: "Hi"
            // FIN=1, opcode=1 (text), mask=1, len=2
            const frame = Buffer.from([
                0x81,       // FIN + text opcode
                0x82,       // masked + length 2
                0x00, 0x00, 0x00, 0x00,  // mask key (zeros for easy test)
                0x48, 0x69  // "Hi" XOR with zeros = "Hi"
            ])

            const result = parseFrame(frame)
            expect(result).not.toBeNull()
            expect(result.frame.opcode).toBe(OPCODES.TEXT)
            expect(result.frame.fin).toBe(true)
            expect(result.frame.payload.toString()).toBe('Hi')
            expect(result.bytesConsumed).toBe(8)
        })

        it('should parse unmasked server frame', () => {
            // Server -> client frames are not masked
            const frame = Buffer.from([
                0x81,       // FIN + text opcode
                0x02,       // not masked + length 2
                0x48, 0x69  // "Hi"
            ])

            const result = parseFrame(frame)
            expect(result.frame.payload.toString()).toBe('Hi')
        })

        it('should handle 16-bit extended length', () => {
            // Length 126 = use next 2 bytes for length
            const payload = Buffer.alloc(200).fill(0x41) // 200 'A's
            const frame = Buffer.concat([
                Buffer.from([0x81, 126, 0x00, 0xC8]), // 200 in big endian
                payload
            ])

            const result = parseFrame(frame)
            expect(result.frame.payload.length).toBe(200)
        })
    })

    describe('buildFrame', () => {
        it('should build text frame', () => {
            const frame = buildFrame('Hi', OPCODES.TEXT)
            expect(frame[0]).toBe(0x81) // FIN + text
            expect(frame[1]).toBe(2)    // length 2
            expect(frame.slice(2).toString()).toBe('Hi')
        })

        it('should build binary frame', () => {
            const data = Buffer.from([0x01, 0x02, 0x03])
            const frame = buildFrame(data, OPCODES.BINARY)
            expect(frame[0]).toBe(0x82) // FIN + binary
        })

        it('should handle medium payload (126-65535 bytes)', () => {
            const data = Buffer.alloc(200).fill(0x41)
            const frame = buildFrame(data)
            expect(frame[1]).toBe(126)  // Extended length marker
            expect(frame.readUInt16BE(2)).toBe(200)
        })

        it('should not mask server frames', () => {
            const frame = buildFrame('test')
            // Mask bit should be 0
            expect(frame[1] & 0x80).toBe(0)
        })
    })

    describe('buildCloseFrame', () => {
        it('should build close frame with code', () => {
            const frame = buildCloseFrame(1000)
            expect(frame[0]).toBe(0x88) // FIN + close
            expect(frame.readUInt16BE(2)).toBe(1000)
        })

        it('should include reason', () => {
            const frame = buildCloseFrame(1000, 'bye')
            expect(frame.slice(4).toString()).toBe('bye')
        })
    })

    describe('parseClosePayload', () => {
        it('should parse close code and reason', () => {
            const payload = Buffer.alloc(5)
            payload.writeUInt16BE(1000, 0)
            payload.write('bye', 2)

            const { code, reason } = parseClosePayload(payload)
            expect(code).toBe(1000)
            expect(reason).toBe('bye')
        })

        it('should handle empty payload', () => {
            const { code, reason } = parseClosePayload(Buffer.alloc(0))
            expect(code).toBe(1005) // No status code received
            expect(reason).toBe('')
        })
    })

    describe('buildPongFrame', () => {
        it('should echo ping data', () => {
            const pingData = Buffer.from('ping-id')
            const pong = buildPongFrame(pingData)
            expect(pong[0]).toBe(0x8A) // FIN + pong
            expect(pong.slice(2).toString()).toBe('ping-id')
        })
    })
})

describe('roundtrip', () => {
    it('should encode and decode frame correctly', () => {
        const original = 'Hello, WebSocket!'
        const frame = buildFrame(original)
        const result = parseFrame(frame)
        expect(result.frame.payload.toString()).toBe(original)
    })
})
