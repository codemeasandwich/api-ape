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

        // Scenario: client claims a 126 extended length but the buffer is
        // truncated right after the second byte. parseFrame must return null
        // so the caller waits for more bytes.
        it('returns null when extended-126 length bytes are missing', () => {
            const frame = Buffer.from([0x81, 126]); // claims 16-bit length but no length bytes
            expect(parseFrame(frame)).toBeNull();
        });

        // Scenario: client claims a 127 extended length but the buffer is
        // truncated before the 8 length bytes arrive.
        it('returns null when extended-127 length bytes are missing', () => {
            const frame = Buffer.from([0x81, 127, 0, 0, 0, 0]); // 4 of 8 length bytes
            expect(parseFrame(frame)).toBeNull();
        });

        // Scenario: client sets MASK=1 but the buffer is truncated before
        // the 4 masking-key bytes. parseFrame must return null.
        it('returns null when mask key bytes are missing', () => {
            const frame = Buffer.from([0x81, 0x80 | 5]); // FIN+text, MASK + len 5, but no mask bytes
            expect(parseFrame(frame)).toBeNull();
        });

        // Scenario: a server sends a frame with payload > 65535 bytes — the
        // extended-127 build path engages. The roundtrip parses it back.
        it('builds and parses a frame with extended-127 length', () => {
            const big = Buffer.alloc(70000, 0x41); // 70000 'A' bytes
            const frame = buildFrame(big, OPCODES.BINARY);
            // Server frames don't have MASK, so length is in bytes 2-9 (8 bytes for 127)
            expect(frame[1]).toBe(127);
            const parsed = parseFrame(frame);
            expect(parsed.frame.payload.length).toBe(70000);
        });

        // Scenario: the client claims a payload length larger than what's
        // actually in the buffer. parseFrame must return null so the caller
        // waits for more bytes.
        it('returns null when payload is truncated', () => {
            const frame = Buffer.from([0x81, 10, 0x41, 0x42]); // claims 10 bytes, has 2
            expect(parseFrame(frame)).toBeNull();
        });
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

    describe('buildFrame fin=false', () => {
        // Scenario: a sender wants to send a fragmented message — the first
        // fragment has fin=false. The cond-expr `fin ? 0x80 : 0x00` engages
        // the RHS (0x00 — no FIN bit set).
        it('produces a frame with FIN bit cleared when fin=false', () => {
            const frame = buildFrame('a', OPCODES.TEXT, false);
            // First byte: 0x00 (no FIN) | 0x01 (TEXT) = 0x01
            expect(frame[0]).toBe(0x01);
        });
    });

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

        // Scenario: buildCloseFrame called with no args (defaults apply) —
        // exercises both default-arg branches at L452.
        it('uses default code 1000 and empty reason when called without args', () => {
            const frame = buildCloseFrame()
            expect(frame.readUInt16BE(2)).toBe(1000)
            // No reason bytes after the 2-byte code
            expect(frame.length).toBe(4) // 2-byte header + 2-byte code
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

// Tests for wsProvider.js
describe('wsProvider.js', () => {
    const {
        getWebSocketProvider,
        getRuntime,
        isDeno,
        isBun,
        isNode24Stable
    } = require('../wsProvider')

    describe('runtime detection', () => {
        it('isDeno should return false in Node environment', () => {
            expect(isDeno()).toBe(false)
        })

        it('isBun should return false in Node environment', () => {
            // In Node.js, process.versions.bun is undefined
            expect(isBun()).toBe(false)
        })

        it('getRuntime should return "node" in Node environment', () => {
            expect(getRuntime()).toBe('node')
        })

        it('isNode24Stable should check version correctly', () => {
            const result = isNode24Stable()
            const nodeVersion = parseInt(process.versions.node.split('.')[0], 10)

            if (nodeVersion >= 24 && !process.versions.node.includes('-')) {
                expect(result).toBe(true)
            } else {
                expect(result).toBe(false)
            }
        })

        // Scenario: a global `Deno` object exists but `Deno.upgradeWebSocket`
        // is not a function (mocked/incomplete polyfill). The binary-expr
        // RHS engages and isDeno returns false.
        it('isDeno returns false when Deno is defined but upgradeWebSocket is missing', () => {
            const realDeno = global.Deno;
            global.Deno = {}; // no upgradeWebSocket
            try {
                expect(isDeno()).toBe(false);
            } finally {
                if (realDeno === undefined) delete global.Deno;
                else global.Deno = realDeno;
            }
        });

        // Scenario: an integrator running on an older Node (<24) — the
        // majorVersion guard fires and isNode24Stable returns false.
        it('isNode24Stable returns false on Node <24 (mocked process.versions.node)', () => {
            const realVersions = process.versions;
            Object.defineProperty(process, 'versions', {
                value: { ...realVersions, node: '18.20.0' },
                configurable: true,
            });
            try {
                expect(isNode24Stable()).toBe(false);
            } finally {
                Object.defineProperty(process, 'versions', {
                    value: realVersions,
                    configurable: true,
                });
            }
        });

        // Scenario: hypothetical environment where process.versions.node is
        // unset (e.g. some browser-with-process polyfill). getRuntime falls
        // through to 'unknown'.
        it('getRuntime returns "unknown" when process.versions.node is absent', () => {
            const realVersions = process.versions;
            Object.defineProperty(process, 'versions', {
                value: { ...realVersions, node: undefined },
                configurable: true,
            });
            try {
                expect(getRuntime()).toBe('unknown');
            } finally {
                Object.defineProperty(process, 'versions', {
                    value: realVersions,
                    configurable: true,
                });
            }
        });
    })

    describe('getWebSocketProvider', () => {
        it('should return a provider object', () => {
            const provider = getWebSocketProvider()
            expect(provider).toHaveProperty('type')
            expect(provider).toHaveProperty('WebSocketServer')
            expect(provider).toHaveProperty('runtime')
        })

        it('should return polyfill or node-native type in Node', () => {
            const provider = getWebSocketProvider()
            expect(['polyfill', 'node-native']).toContain(provider.type)
        })

        it('should return node runtime', () => {
            const provider = getWebSocketProvider()
            expect(provider.runtime).toBe('node')
        })

        it('should return a WebSocketServer constructor', () => {
            const provider = getWebSocketProvider()
            expect(typeof provider.WebSocketServer).toBe('function')
        })

        it('should cache the provider', () => {
            const provider1 = getWebSocketProvider()
            const provider2 = getWebSocketProvider()
            expect(provider1).toBe(provider2)
        })
    })
})
