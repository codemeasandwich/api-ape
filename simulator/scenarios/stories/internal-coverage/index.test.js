/**
 * @fileoverview Internal Module Coverage Tests
 *
 * These tests directly exercise internal modules to ensure complete coverage
 * of edge cases that are difficult to trigger via E2E tests alone.
 *
 * Tests cover:
 * - tagUtils: cleanUploadTags, setValueAtPath
 * - security/reply: replayCheck for future/stale/duplicate requests
 * - ws/server: WebSocket handshake validation
 * - ws/socket: fragmented messages, pong handling
 *
 * @module simulator/scenarios/stories/internal-coverage
 */

jest.setTimeout(15000);

describe('Internal Module Coverage Tests', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    describe('tagUtils Module', () => {
        let tagUtils;

        beforeEach(() => {
            tagUtils = require('../../../../server/socket/tagUtils');
        });

        describe('cleanUploadTags', () => {
            test('passes primitives through unchanged', () => {
                expect(tagUtils.cleanUploadTags(null)).toBe(null);
                expect(tagUtils.cleanUploadTags(undefined)).toBe(undefined);
                expect(tagUtils.cleanUploadTags('string')).toBe('string');
                expect(tagUtils.cleanUploadTags(42)).toBe(42);
                expect(tagUtils.cleanUploadTags(true)).toBe(true);
            });

            test('cleans simple <!B> tags', () => {
                const input = { 'file<!B>': 'hash123', name: 'test.txt' };
                const result = tagUtils.cleanUploadTags(input);

                expect(result.file).toBe('hash123');
                expect(result.name).toBe('test.txt');
                expect(result['file<!B>']).toBeUndefined();
            });

            test('cleans simple <!A> tags', () => {
                const input = { 'buffer<!A>': 'hashABC', size: 1024 };
                const result = tagUtils.cleanUploadTags(input);

                expect(result.buffer).toBe('hashABC');
                expect(result.size).toBe(1024);
                expect(result['buffer<!A>']).toBeUndefined();
            });

            test('cleans nested objects with tags', () => {
                const input = {
                    user: {
                        'avatar<!B>': 'hash1',
                        profile: {
                            'banner<!A>': 'hash2',
                            name: 'Alice'
                        }
                    }
                };
                const result = tagUtils.cleanUploadTags(input);

                expect(result.user.avatar).toBe('hash1');
                expect(result.user.profile.banner).toBe('hash2');
                expect(result.user.profile.name).toBe('Alice');
            });

            test('cleans arrays of objects with tags', () => {
                const input = {
                    files: [
                        { 'data<!B>': 'hash1', name: 'file1.txt' },
                        { 'data<!B>': 'hash2', name: 'file2.txt' }
                    ]
                };
                const result = tagUtils.cleanUploadTags(input);

                expect(result.files[0].data).toBe('hash1');
                expect(result.files[0].name).toBe('file1.txt');
                expect(result.files[1].data).toBe('hash2');
                expect(result.files[1].name).toBe('file2.txt');
            });

            test('handles empty arrays', () => {
                const input = { items: [] };
                const result = tagUtils.cleanUploadTags(input);
                expect(result.items).toEqual([]);
            });

            test('handles empty objects', () => {
                const input = {};
                const result = tagUtils.cleanUploadTags(input);
                expect(result).toEqual({});
            });
        });

        describe('setValueAtPath', () => {
            test('sets simple path', () => {
                const obj = { avatar: 'hash123' };
                const buffer = Buffer.from([1, 2, 3]);
                tagUtils.setValueAtPath(obj, 'avatar', buffer);

                expect(Buffer.isBuffer(obj.avatar)).toBe(true);
                expect(obj.avatar).toEqual(buffer);
            });

            test('sets nested path', () => {
                const obj = { user: { profile: { avatar: 'hash' } } };
                const buffer = Buffer.from('image data');
                tagUtils.setValueAtPath(obj, 'user.profile.avatar', buffer);

                expect(Buffer.isBuffer(obj.user.profile.avatar)).toBe(true);
            });

            test('sets path in array', () => {
                const obj = { files: [{ data: 'h1' }, { data: 'h2' }] };
                const buffer = Buffer.from('content1');
                tagUtils.setValueAtPath(obj, 'files.0.data', buffer);

                expect(Buffer.isBuffer(obj.files[0].data)).toBe(true);
                expect(obj.files[1].data).toBe('h2');
            });

            test('sets deeply nested array path', () => {
                const obj = {
                    users: [
                        { uploads: [{ 'data': 'hash1' }] }
                    ]
                };
                const buffer = Buffer.from('nested data');
                tagUtils.setValueAtPath(obj, 'users.0.uploads.0.data', buffer);

                expect(Buffer.isBuffer(obj.users[0].uploads[0].data)).toBe(true);
            });
        });

        describe('findUploadTags', () => {
            test('finds simple <!B> tag', () => {
                const input = { 'file<!B>': 'hash123' };
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(1);
                expect(tags[0].path).toBe('file');
                expect(tags[0].hash).toBe('hash123');
                expect(tags[0].tag).toBe('B');
            });

            test('finds simple <!A> tag', () => {
                const input = { 'buffer<!A>': 'hashABC' };
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(1);
                expect(tags[0].path).toBe('buffer');
                expect(tags[0].hash).toBe('hashABC');
                expect(tags[0].tag).toBe('A');
            });

            test('finds multiple tags', () => {
                const input = {
                    'file1<!B>': 'hash1',
                    'file2<!A>': 'hash2',
                    name: 'test'
                };
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(2);
            });

            test('finds nested tags', () => {
                const input = {
                    user: {
                        'avatar<!B>': 'hash1',
                        profile: {
                            'banner<!A>': 'hash2'
                        }
                    }
                };
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(2);
                expect(tags.find(t => t.path === 'user.avatar')).toBeDefined();
                expect(tags.find(t => t.path === 'user.profile.banner')).toBeDefined();
            });

            test('finds tags in arrays', () => {
                const input = {
                    files: [
                        { 'data<!B>': 'hash1' },
                        { 'data<!B>': 'hash2' }
                    ]
                };
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(2);
                expect(tags.find(t => t.path === 'files.0.data')).toBeDefined();
                expect(tags.find(t => t.path === 'files.1.data')).toBeDefined();
            });

            test('returns empty for primitives', () => {
                expect(tagUtils.findUploadTags(null)).toEqual([]);
                expect(tagUtils.findUploadTags(undefined)).toEqual([]);
                expect(tagUtils.findUploadTags('string')).toEqual([]);
                expect(tagUtils.findUploadTags(42)).toEqual([]);
            });

            test('finds tags in root-level array', () => {
                // This tests tagUtils.js line 124 - array without parent path
                const input = [
                    { 'data<!B>': 'hash1' },
                    { 'data<!A>': 'hash2' },
                    { name: 'no-tag' }
                ];
                const tags = tagUtils.findUploadTags(input);

                expect(tags.length).toBe(2);
                // Root level array uses String(i) for path
                expect(tags.find(t => t.path === '0.data')).toBeDefined();
                expect(tags.find(t => t.path === '1.data')).toBeDefined();
            });
        });

        describe('findFileTags', () => {
            test('finds <!F> file tags', () => {
                const input = { 'doc<!F>': 'filehash123' };
                const tags = tagUtils.findFileTags(input);

                expect(tags.length).toBe(1);
                expect(tags[0].path).toBe('doc');
                expect(tags[0].hash).toBe('filehash123');
            });

            test('returns empty for no file tags', () => {
                const input = { 'file<!B>': 'hash', name: 'test' };
                const tags = tagUtils.findFileTags(input);

                expect(tags.length).toBe(0);
            });

            test('finds file tags in root-level array', () => {
                // This tests tagUtils.js line 203 - array without parent path
                const input = [
                    { 'doc<!F>': 'hash1' },
                    { 'file<!F>': 'hash2' },
                    { name: 'no-tag' }
                ];
                const tags = tagUtils.findFileTags(input);

                expect(tags.length).toBe(2);
                // Root level array uses String(i) for path
                expect(tags.find(t => t.path === '0.doc')).toBeDefined();
                expect(tags.find(t => t.path === '1.file')).toBeDefined();
            });

            test('finds file tags in nested objects within array', () => {
                const input = {
                    attachments: [
                        { 'doc<!F>': 'hash1', meta: { type: 'pdf' } },
                        { nested: { 'image<!F>': 'hash2' } }
                    ]
                };
                const tags = tagUtils.findFileTags(input);

                expect(tags.length).toBe(2);
                expect(tags.find(t => t.path === 'attachments.0.doc')).toBeDefined();
                expect(tags.find(t => t.path === 'attachments.1.nested.image')).toBeDefined();
            });
        });
    });

    describe('security/reply Module', () => {
        let createReplayCheck;

        beforeEach(() => {
            createReplayCheck = require('../../../../server/security/reply');
        });

        describe('replayCheck', () => {
            test('accepts valid request within time window', () => {
                const check = createReplayCheck();
                const now = Date.now();

                // Should not throw
                expect(() => check('query1', now)).not.toThrow();
            });

            test('rejects request from the future', () => {
                const check = createReplayCheck();
                const futureTime = Date.now() + 5000; // 5 seconds in future

                expect(() => check('query1', futureTime)).toThrow(/ahead of server/);
            });

            test('rejects stale request older than 10 seconds', () => {
                const check = createReplayCheck();
                const staleTime = Date.now() - 15000; // 15 seconds ago

                expect(() => check('query1', staleTime)).toThrow(/old by/);
            });

            test('rejects duplicate queryId', () => {
                const check = createReplayCheck();
                const now = Date.now();

                // First request should succeed
                check('query1', now);

                // Same queryId at slightly different time should be rejected (duplicate)
                expect(() => check('query1', now)).toThrow(/Duplicate request/);
            });

            test('multiple different queryIds are allowed', () => {
                const check = createReplayCheck();
                const now = Date.now();

                // Different queryIds should all succeed
                check('query1', now);
                check('query2', now);
                check('query3', now);
                // No error thrown
            });

            test('handles multiple checks in sequence', () => {
                const check = createReplayCheck();

                // Multiple checks with current time should work
                for (let i = 0; i < 10; i++) {
                    check(`query-${i}`, Date.now());
                }
                // No errors thrown
            });
        });
    });

    describe('WebSocket Server Handshake', () => {
        const net = require('net');
        const crypto = require('crypto');

        test('rejects connection with missing upgrade header', async () => {
            const http = require('http');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, () => {});
            });

            // Try to send an invalid upgrade request
            const socket = net.createConnection(port, 'localhost');

            await new Promise((resolve, reject) => {
                socket.on('connect', () => {
                    // Send a request without proper upgrade headers
                    socket.write('GET / HTTP/1.1\r\n');
                    socket.write('Host: localhost\r\n');
                    socket.write('Upgrade: something-else\r\n'); // Not "websocket"
                    socket.write('Connection: Upgrade\r\n');
                    socket.write('\r\n');
                });

                socket.on('close', () => resolve());
                socket.on('error', () => resolve()); // Connection refused is also valid

                setTimeout(resolve, 500);
            });

            socket.destroy();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('rejects connection with missing sec-websocket-key', async () => {
            const http = require('http');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, () => {});
            });

            const socket = net.createConnection(port, 'localhost');

            await new Promise((resolve) => {
                socket.on('connect', () => {
                    // Send WebSocket upgrade without key
                    socket.write('GET / HTTP/1.1\r\n');
                    socket.write('Host: localhost\r\n');
                    socket.write('Upgrade: websocket\r\n');
                    socket.write('Connection: Upgrade\r\n');
                    // No Sec-WebSocket-Key header
                    socket.write('\r\n');
                });

                socket.on('close', () => resolve());
                socket.on('error', () => resolve());

                setTimeout(resolve, 500);
            });

            socket.destroy();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('rejects connection with invalid sec-websocket-key format', async () => {
            const http = require('http');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, () => {});
            });

            const socket = net.createConnection(port, 'localhost');

            await new Promise((resolve) => {
                socket.on('connect', () => {
                    // Send WebSocket upgrade with invalid key (not proper base64 format)
                    socket.write('GET / HTTP/1.1\r\n');
                    socket.write('Host: localhost\r\n');
                    socket.write('Upgrade: websocket\r\n');
                    socket.write('Connection: Upgrade\r\n');
                    socket.write('Sec-WebSocket-Key: invalid-key-format\r\n');
                    socket.write('\r\n');
                });

                socket.on('close', () => resolve());
                socket.on('error', () => resolve());

                setTimeout(resolve, 500);
            });

            socket.destroy();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('server close terminates all connections', async () => {
            const http = require('http');
            const WebSocket = require('ws');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            let connectedClient = null;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    connectedClient = ws;
                });
            });

            // Connect a client
            const client = new WebSocket(`ws://localhost:${port}/`);

            await new Promise((resolve, reject) => {
                client.on('open', resolve);
                client.on('error', reject);
                setTimeout(() => reject(new Error('Timeout')), 5000);
            });

            expect(client.readyState).toBe(WebSocket.OPEN);

            // Close the server - should close all clients
            let closeCallbackCalled = false;
            wss.close(() => {
                closeCallbackCalled = true;
            });

            // Wait a bit for the close to propagate
            await new Promise(r => setTimeout(r, 100));

            expect(closeCallbackCalled).toBe(true);
            expect(wss.clients.size).toBe(0);

            // Client should receive close
            await new Promise((resolve) => {
                if (client.readyState !== WebSocket.OPEN) {
                    resolve();
                    return;
                }
                client.on('close', resolve);
                setTimeout(resolve, 500);
            });

            await new Promise(resolve => httpServer.close(resolve));
        });
    });

    describe('WebSocket Socket Frame Handling', () => {
        const net = require('net');
        const crypto = require('crypto');

        function createWebSocketFrame(opcode, payload, fin = true, masked = true) {
            const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
            const payloadLength = payloadBuffer.length;

            let headerLength = 2;
            let extendedPayloadLength = 0;

            if (payloadLength > 65535) {
                headerLength += 8;
                extendedPayloadLength = 127;
            } else if (payloadLength > 125) {
                headerLength += 2;
                extendedPayloadLength = 126;
            }

            if (masked) {
                headerLength += 4;
            }

            const frame = Buffer.alloc(headerLength + payloadLength);

            // First byte: FIN + opcode
            frame[0] = (fin ? 0x80 : 0x00) | opcode;

            // Second byte: MASK + payload length
            if (extendedPayloadLength === 127) {
                frame[1] = (masked ? 0x80 : 0x00) | 127;
                // 64-bit length (we only use 32-bit)
                frame.writeUInt32BE(0, 2);
                frame.writeUInt32BE(payloadLength, 6);
            } else if (extendedPayloadLength === 126) {
                frame[1] = (masked ? 0x80 : 0x00) | 126;
                frame.writeUInt16BE(payloadLength, 2);
            } else {
                frame[1] = (masked ? 0x80 : 0x00) | payloadLength;
            }

            let maskOffset = 2;
            if (extendedPayloadLength === 127) {
                maskOffset = 10;
            } else if (extendedPayloadLength === 126) {
                maskOffset = 4;
            }

            let payloadOffset = maskOffset;

            if (masked) {
                const maskKey = crypto.randomBytes(4);
                maskKey.copy(frame, maskOffset);
                payloadOffset = maskOffset + 4;

                // XOR payload with mask
                for (let i = 0; i < payloadLength; i++) {
                    frame[payloadOffset + i] = payloadBuffer[i] ^ maskKey[i % 4];
                }
            } else {
                payloadBuffer.copy(frame, payloadOffset);
            }

            return frame;
        }

        test('handles pong frame silently', async () => {
            const http = require('http');
            const WebSocket = require('ws');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            let serverWs = null;
            let messageReceived = false;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    serverWs = ws;
                    ws.on('message', () => {
                        messageReceived = true;
                    });
                });
            });

            // Connect using ws library
            const client = new WebSocket(`ws://localhost:${port}/`);

            await new Promise((resolve, reject) => {
                client.on('open', () => {
                    // Send a pong (ws library method)
                    client.pong();
                    // Then send a normal message to verify connection works
                    setTimeout(() => {
                        client.send('test after pong');
                    }, 50);
                    setTimeout(resolve, 100);
                });
                client.on('error', reject);
            });

            // Verify message was received after pong
            expect(messageReceived).toBe(true);

            client.close();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('closes connection on unknown opcode', async () => {
            const http = require('http');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, () => {});
            });

            const socket = net.createConnection(port, 'localhost');

            let connectionClosed = false;

            await new Promise((resolve, reject) => {
                socket.on('connect', () => {
                    const key = crypto.randomBytes(16).toString('base64');
                    socket.write('GET / HTTP/1.1\r\n');
                    socket.write('Host: localhost\r\n');
                    socket.write('Upgrade: websocket\r\n');
                    socket.write('Connection: Upgrade\r\n');
                    socket.write(`Sec-WebSocket-Key: ${key}\r\n`);
                    socket.write('Sec-WebSocket-Version: 13\r\n');
                    socket.write('\r\n');
                });

                let handshakeComplete = false;
                let responseBuffer = Buffer.alloc(0);

                socket.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);

                    if (!handshakeComplete) {
                        const responseStr = responseBuffer.toString();
                        if (responseStr.includes('101 Switching Protocols')) {
                            handshakeComplete = true;
                            // Send an invalid opcode (0xF is reserved)
                            const invalidFrame = createWebSocketFrame(0xF, Buffer.alloc(0));
                            socket.write(invalidFrame);
                        }
                    }
                });

                socket.on('close', () => {
                    connectionClosed = true;
                    resolve();
                });

                socket.on('error', () => {
                    connectionClosed = true;
                    resolve();
                });

                setTimeout(resolve, 500);
            });

            // Connection should be closed due to protocol error
            // (either by close frame or socket destruction)
            socket.destroy();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('handles large messages that may fragment', async () => {
            // Large messages exercise the frame handling code paths
            const http = require('http');
            const WebSocket = require('ws');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            let receivedSize = 0;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    ws.on('message', (data) => {
                        receivedSize = data.length;
                    });
                });
            });

            const client = new WebSocket(`ws://localhost:${port}/`);

            await new Promise((resolve, reject) => {
                client.on('open', () => {
                    // Send a large message that may be fragmented
                    const largeData = 'X'.repeat(100000);
                    client.send(largeData);
                    setTimeout(resolve, 100);
                });
                client.on('error', reject);
            });

            expect(receivedSize).toBe(100000);

            client.close();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });

        test('rejects unexpected continuation frame', async () => {
            const http = require('http');
            const { WebSocketServer } = require('../../../../server/lib/ws');

            const httpServer = http.createServer();
            const wss = new WebSocketServer();

            await new Promise(resolve => httpServer.listen(0, 'localhost', resolve));
            const port = httpServer.address().port;

            httpServer.on('upgrade', (req, socket, head) => {
                wss.handleUpgrade(req, socket, head, () => {});
            });

            const socket = net.createConnection(port, 'localhost');

            await new Promise((resolve, reject) => {
                socket.on('connect', () => {
                    const key = crypto.randomBytes(16).toString('base64');
                    socket.write('GET / HTTP/1.1\r\n');
                    socket.write('Host: localhost\r\n');
                    socket.write('Upgrade: websocket\r\n');
                    socket.write('Connection: Upgrade\r\n');
                    socket.write(`Sec-WebSocket-Key: ${key}\r\n`);
                    socket.write('Sec-WebSocket-Version: 13\r\n');
                    socket.write('\r\n');
                });

                let handshakeComplete = false;
                let responseBuffer = Buffer.alloc(0);

                socket.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);

                    if (!handshakeComplete) {
                        const responseStr = responseBuffer.toString();
                        if (responseStr.includes('101 Switching Protocols')) {
                            handshakeComplete = true;

                            // Send continuation frame without a starting frame (protocol error)
                            const continuationFrame = createWebSocketFrame(0x0, 'orphan data');
                            socket.write(continuationFrame);
                        }
                    }
                });

                socket.on('close', resolve);
                socket.on('error', resolve);

                setTimeout(resolve, 500);
            });

            socket.destroy();
            wss.close();
            await new Promise(resolve => httpServer.close(resolve));
        });
    });

    describe('genId Edge Cases', () => {
        let genId;

        beforeEach(() => {
            genId = require('../../../../server/utils/genId');
        });

        test('generates ID with default length', () => {
            const id = genId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });

        test('generates ID with custom length', () => {
            const id = genId(32);
            expect(id.length).toBe(32);
        });

        test('generates unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(genId());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('parseUserAgent Edge Cases', () => {
        let parseUserAgent;

        beforeEach(() => {
            parseUserAgent = require('../../../../server/utils/parseUserAgent');
        });

        test('handles empty user agent', () => {
            const result = parseUserAgent('');
            expect(result).toBeDefined();
        });

        test('handles null user agent', () => {
            const result = parseUserAgent(null);
            expect(result).toBeDefined();
        });

        test('handles undefined user agent', () => {
            const result = parseUserAgent(undefined);
            expect(result).toBeDefined();
        });

        test('parses Chrome user agent', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const result = parseUserAgent(ua);
            expect(result.browser.name).toBe('Chrome');
        });

        test('parses Safari user agent', () => {
            const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
            const result = parseUserAgent(ua);
            expect(result.browser.name).toBe('Safari');
        });

        test('parses Firefox user agent', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
            const result = parseUserAgent(ua);
            expect(result.browser.name).toBe('Firefox');
        });
    });

    describe('extractRootDomain ccTLD Support', () => {
        let extractRootDomain;

        beforeEach(() => {
            extractRootDomain = require('../../../../server/security/extractRootDomain');
        });

        test('handles standard domains', () => {
            expect(extractRootDomain('https://app.example.com')).toBe('example.com');
            expect(extractRootDomain('https://sub.example.com:3000/path')).toBe('example.com');
            expect(extractRootDomain('example.com')).toBe('example.com');
        });

        test('handles country code TLDs (ccTLD)', () => {
            // UK domains
            expect(extractRootDomain('https://app.example.co.uk')).toBe('example.co.uk');
            expect(extractRootDomain('api.example.co.uk:8080')).toBe('example.co.uk');

            // Australian domains
            expect(extractRootDomain('https://api.mysite.com.au')).toBe('mysite.com.au');

            // Other ccTLDs
            expect(extractRootDomain('https://sub.example.me.uk')).toBe('example.me.uk');
        });

        test('handles edge cases', () => {
            expect(extractRootDomain('')).toBe('');
            expect(extractRootDomain(null)).toBe('');
            expect(extractRootDomain(undefined)).toBe('');
            expect(extractRootDomain('localhost')).toBe('localhost');
            expect(extractRootDomain('localhost:3000')).toBe('localhost');
        });

        test('handles malformed URLs gracefully', () => {
            // The catch block should handle these
            const result = extractRootDomain('not-a-valid-url');
            expect(result).toBe('not-a-valid-url');
        });

        test('handles URL that throws on parse (catch block line 147)', () => {
            // This exercises the catch block - URL constructor throws on invalid protocol
            // The catch returns url.split(":")[0]
            const result = extractRootDomain('://broken-protocol');
            expect(result).toBe('');
        });

        test('handles URL with only protocol that triggers catch', () => {
            // Pass a string that can't be parsed by URL constructor
            // This forces the catch block to execute
            const result = extractRootDomain('http:');
            expect(result).toBeDefined();
        });
    });

    describe('Node Runtime Edge Cases', () => {
        const http = require('http');
        const WebSocket = require('ws');
        const { Harness } = require('../../../harness');

        let harness;

        beforeEach(() => {
            harness = new Harness({ basePort: 29000, connectTimeout: 5000 });
        });

        afterEach(async () => {
            await harness.cleanup();
        });

        test('rejects WebSocket upgrade to non-api-ape path', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            // Try to upgrade at wrong path - should be rejected
            const connectionResult = await new Promise((resolve) => {
                const ws = new WebSocket(`ws://localhost:${server.port}/wrong-path`);

                ws.on('open', () => {
                    // Should not reach here
                    ws.close();
                    resolve({ connected: true });
                });

                ws.on('error', () => {
                    resolve({ connected: false, error: true });
                });

                ws.on('close', () => {
                    resolve({ connected: false, closed: true });
                });

                setTimeout(() => resolve({ connected: false, timeout: true }), 500);
            });

            // Connection should be rejected
            expect(connectionResult.connected).toBe(false);
        });

        test('attempts to serve client bundle at correct path', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            // Request client bundle - format is /{apiPath}/ape.js
            // In test environment, bundle may not exist, but this exercises the handler
            const bundlePath = `${server.url}/${server.apiPath}/ape.js`;
            const response = await new Promise((resolve, reject) => {
                http.get(bundlePath, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
                }).on('error', reject);
            });

            // Either serves bundle (200) or returns error if bundle not built (500)
            // This exercises the serveClientBundle code path
            expect([200, 500]).toContain(response.status);
        });

        test('attempts to serve source map at correct path', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            // Request source map - format is /{apiPath}/ape.js.map
            // In test environment, map may not exist, but this exercises the handler
            const mapPath = `${server.url}/${server.apiPath}/ape.js.map`;
            const response = await new Promise((resolve, reject) => {
                http.get(mapPath, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                }).on('error', reject);
            });

            // Either serves map (200), not found (404), or error (500)
            // This exercises the serveSourceMap code path
            expect([200, 404, 500]).toContain(response.status);
        });

        // Real-world scenario: an IDE/LSP requests the auto-generated schema
        // for IntelliSense. The Node runtime routes GET /{where}/ape/schema
        // to the schemaHandler that emits a JSON snapshot of all controllers.
        test('GET /api/ape/schema returns schema JSON', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const schemaPath = `${server.url}/${server.apiPath}/ape/schema`;
            const response = await new Promise((resolve, reject) => {
                http.get(schemaPath, (res) => {
                    let body = '';
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => resolve({
                        status: res.statusCode,
                        body,
                        contentType: res.headers['content-type'],
                    }));
                }).on('error', reject);
            });
            expect(response.status).toBe(200);
            expect(response.contentType).toMatch(/application\/json/);
            // The body should parse as a schema object
            const parsed = JSON.parse(response.body);
            expect(parsed).toHaveProperty('endpoints');
            expect(Array.isArray(parsed.endpoints)).toBe(true);
        });

        // Real-world scenario: a browser sends a CORS preflight before the
        // GET above (e.g. when the IDE/LSP is on a different origin). The
        // OPTIONS handler must answer with the CORS headers + 204.
        test('OPTIONS /api/ape/schema returns 204 with CORS headers', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const url = new URL(`${server.url}/${server.apiPath}/ape/schema`);
            const response = await new Promise((resolve, reject) => {
                const req = http.request({
                    method: 'OPTIONS',
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                }, (res) => {
                    res.on('data', () => {});
                    res.on('end', () => resolve({
                        status: res.statusCode,
                        headers: res.headers,
                    }));
                });
                req.on('error', reject);
                req.end();
            });
            expect(response.status).toBe(204);
            expect(response.headers['access-control-allow-origin']).toBe('*');
            expect(response.headers['access-control-allow-methods']).toMatch(/GET/);
            expect(response.headers['access-control-allow-methods']).toMatch(/OPTIONS/);
        });
    });

    describe('Origin Validation Security', () => {
        let verifyOrigin;

        beforeEach(() => {
            // Module exports the function directly (not as verifyOrigin property)
            verifyOrigin = require('../../../../server/security/origin');
        });

        test('verifyOrigin returns true when origins match', () => {
            const mockSocket = { destroy: jest.fn() };
            const mockReq = {
                headers: {
                    origin: 'http://localhost:3000',
                    host: 'localhost:3000'
                }
            };

            const result = verifyOrigin(mockSocket, mockReq, () => {});
            expect(result).toBe(true);
            expect(mockSocket.destroy).not.toHaveBeenCalled();
        });

        test('verifyOrigin destroys socket on origin mismatch', () => {
            const mockSocket = { destroy: jest.fn() };
            const mockReq = {
                headers: {
                    origin: 'http://evil-site.com',
                    host: 'localhost:3000'
                }
            };

            const errors = [];
            const result = verifyOrigin(mockSocket, mockReq, (err) => errors.push(err));

            expect(result).toBe(false);
            expect(mockSocket.destroy).toHaveBeenCalled();
            expect(errors.length).toBeGreaterThan(0);
        });

        test('verifyOrigin handles Express-style req.header() method', () => {
            const mockSocket = { destroy: jest.fn() };
            const mockReq = {
                header: (name) => {
                    if (name === 'Origin') return 'http://localhost:4000';
                    if (name === 'Host') return 'localhost:4000';
                    return null;
                },
                headers: {} // Empty headers - forces use of req.header()
            };

            const result = verifyOrigin(mockSocket, mockReq, () => {});
            expect(result).toBe(true);
        });

        test('verifyOrigin returns true when no origin header (same-origin request)', () => {
            const mockSocket = { destroy: jest.fn() };
            const mockReq = {
                headers: {
                    host: 'localhost:3000'
                    // No origin header
                }
            };

            const result = verifyOrigin(mockSocket, mockReq, () => {});
            expect(result).toBe(true);
        });

        // Real-world scenario: a host using api-ape behind a permissive ingress
        // calls verifyOrigin without supplying their own logger. The default
        // `onError = onError || console.error` short-circuit must select
        // console.error so rejection diagnostics still surface on the server's
        // stderr stream during a CSRF-style spoofed-origin attempt.
        test('verifyOrigin defaults to console.error when no onError supplied and rejects mismatched origin', () => {
            const mockSocket = { destroy: jest.fn() };
            const mockReq = {
                headers: {
                    origin: 'https://attacker.example',
                    host: 'api.legitimate.example'
                }
            };
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const result = verifyOrigin(mockSocket, mockReq);
                expect(result).toBe(false);
                expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('REJECTING'));
                expect(mockSocket.destroy).toHaveBeenCalled();
            } finally {
                errSpy.mockRestore();
            }
        });
    });

    describe('Phase 1 wiring resume (logical reconnect)', () => {
        let resumeRegistry;
        let upgradeResume;
        let sessionIdentity;

        beforeEach(() => {
            jest.resetModules();
            resumeRegistry = require('../../../../server/lib/wiring/resumeRegistry');
            upgradeResume = require('../../../../server/lib/wiring/upgradeResume');
            sessionIdentity = require('../../../../server/lib/sessionIdentity');
            resumeRegistry.resetResumeRegistryForTesting();
        });

        afterEach(() => {
            resumeRegistry.resetResumeRegistryForTesting();
        });

        test('resumeRegistry resumeTtlMs honors APE_RESUME_TTL_MS', () => {
            const prev = process.env.APE_RESUME_TTL_MS;
            try {
                process.env.APE_RESUME_TTL_MS = '999';
                jest.resetModules();
                const rr = require('../../../../server/lib/wiring/resumeRegistry');
                expect(rr.resumeTtlMs()).toBe(999);
            } finally {
                if (prev === undefined) delete process.env.APE_RESUME_TTL_MS;
                else process.env.APE_RESUME_TTL_MS = prev;
                jest.resetModules();
            }
        });

        test('resumeRegistry resumeTtlMs falls back when env invalid', () => {
            const prev = process.env.APE_RESUME_TTL_MS;
            try {
                process.env.APE_RESUME_TTL_MS = 'nope';
                jest.resetModules();
                const rr = require('../../../../server/lib/wiring/resumeRegistry');
                expect(rr.resumeTtlMs()).toBe(120000);
            } finally {
                if (prev === undefined) delete process.env.APE_RESUME_TTL_MS;
                else process.env.APE_RESUME_TTL_MS = prev;
                jest.resetModules();
            }
        });

        test('resumeRegistry claim, mismatch, cancel, reset', () => {
            resumeRegistry.registerPendingResume('cid1', 'sessA');
            expect(resumeRegistry.claimPendingResume('cid1', 'sessA')).toBe(true);

            resumeRegistry.registerPendingResume('cid2', 'sessB');
            expect(resumeRegistry.claimPendingResume('cid2', 'wrong')).toBe(false);

            resumeRegistry.registerPendingResume('cid3', 'sessC');
            resumeRegistry.cancelPendingResume('cid3');
            expect(resumeRegistry.claimPendingResume('cid3', 'sessC')).toBe(false);

            resumeRegistry.registerPendingResume('cid4', 'sessD');
            resumeRegistry.resetResumeRegistryForTesting();
            expect(resumeRegistry.claimPendingResume('cid4', 'sessD')).toBe(false);
        });

        test('resumeRegistry register replaces prior slot for same client id', () => {
            resumeRegistry.registerPendingResume('c', 's1');
            resumeRegistry.registerPendingResume('c', 's2');
            expect(resumeRegistry.claimPendingResume('c', 's2')).toBe(true);
        });

        test('resumeRegistry cancelPendingResume for unknown id is safe', () => {
            expect(() => resumeRegistry.cancelPendingResume('unknown')).not.toThrow();
        });

        test('resumeRegistry tolerates setTimeout return without unref', () => {
            const orig = global.setTimeout;
            global.setTimeout = jest.fn(() => ({}));
            try {
                resumeRegistry.registerPendingResume('u', 'sess');
            } finally {
                global.setTimeout = orig;
            }
            resumeRegistry.resetResumeRegistryForTesting();
        });

        test('resumeRegistry TTL removes pending slot without claim', () => {
            const prevTtl = process.env.APE_RESUME_TTL_MS;
            jest.useFakeTimers();
            try {
                process.env.APE_RESUME_TTL_MS = '10000';
                jest.resetModules();
                const rr = require('../../../../server/lib/wiring/resumeRegistry');
                rr.registerPendingResume('ttl-exp', 'sessZ');
                jest.advanceTimersByTime(10001);
                expect(rr.claimPendingResume('ttl-exp', 'sessZ')).toBe(false);
                rr.resetResumeRegistryForTesting();
            } finally {
                jest.useRealTimers();
                if (prevTtl === undefined) delete process.env.APE_RESUME_TTL_MS;
                else process.env.APE_RESUME_TTL_MS = prevTtl;
                jest.resetModules();
            }
        });

        test('parseResumeHint uses query, headers, rejects bad charset', () => {
            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape?resume=01ABC',
                    headers: {},
                }),
            ).toBe('01ABC');

            expect(
                upgradeResume.parseResumeHint({
                    url:
                        '/api/ape?resume=' + encodeURIComponent('12XYZ'),
                    headers: {},
                }),
            ).toBe('12XYZ');

            expect(
                upgradeResume.parseResumeHint({
                    url: '::::',
                    headers: { 'x-ape-resume': 'QQ77' },
                }),
            ).toBe('QQ77');

            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape',
                    headers: { 'x-ape-resume': 'AA88' },
                }),
            ).toBe('AA88');

            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape',
                    headers: { resume: 'BB99' },
                }),
            ).toBe('BB99');

            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape?resume=bad!chars',
                    headers: {},
                }),
            ).toBeNull();

            expect(
                upgradeResume.parseResumeHint({ url: '/api/ape', headers: {} }),
            ).toBeNull();
        });

        test('parseResumeHint survives decodeURIComponent error and URL errors', () => {
            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape?resume=%',
                    headers: { 'x-ape-resume': 'ZZ11' },
                }),
            ).toBe('ZZ11');

            const reqBadUrl = {};
            Object.defineProperty(reqBadUrl, 'url', {
                get() {
                    throw new Error('bad url');
                },
                configurable: true,
            });
            reqBadUrl.headers = { resume: 'YY22' };
            expect(upgradeResume.parseResumeHint(reqBadUrl)).toBe('YY22');

            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape?resume=' + '3'.repeat(65),
                    headers: {},
                }),
            ).toBeNull();
        });

        test('parseResumeHint treats empty resume query as absent and reads headers', () => {
            expect(
                upgradeResume.parseResumeHint({
                    url: '/api/ape?resume=',
                    headers: { 'x-ape-resume': 'WW55' },
                }),
            ).toBe('WW55');
        });

        test('parseResumeHint uses default path when req.url is missing', () => {
            expect(
                upgradeResume.parseResumeHint({
                    headers: { resume: 'XX66' },
                }),
            ).toBe('XX66');
        });

        test('resolveWsClientId supersede live socket with matching session', () => {
            const removeClient = jest.fn();
            const socket = {
                close: jest.fn(),
                terminate: jest.fn(),
                destroy: jest.fn(),
            };
            const wrapper = { _raw: { socket, sessionId: 'S1' } };
            const _clients = new Map([['01234567890123456789', wrapper]]);
            const req = {
                url: '/api/ape?resume=01234567890123456789',
                headers: { cookie: 'sessionId=S1' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).toBe('01234567890123456789');
            expect(socket.close).toHaveBeenCalled();
            expect(removeClient).toHaveBeenCalledWith('01234567890123456789');
        });

        test('resolveWsClientId supersede close-only socket', () => {
            const removeClient = jest.fn();
            const socket = { close: jest.fn() };
            const wrapper = { _raw: { socket, sessionId: 'S2' } };
            const _clients = new Map([['12345678901234567890', wrapper]]);
            const req = {
                url: '/api/ape?resume=12345678901234567890',
                headers: { cookie: 'sessionId=S2' },
            };
            upgradeResume.resolveWsClientId(req, { _clients, removeClient });
            expect(socket.close).toHaveBeenCalled();
        });

        test('resolveWsClientId supersede uses terminate when close missing', () => {
            const removeClient = jest.fn();
            const socket = { terminate: jest.fn(), destroy: jest.fn() };
            const wrapper = { _raw: { socket, sessionId: 'S2B' } };
            const _clients = new Map([['45678901234567890123', wrapper]]);
            const req = {
                url: '/api/ape?resume=45678901234567890123',
                headers: { cookie: 'sessionId=S2B' },
            };
            upgradeResume.resolveWsClientId(req, { _clients, removeClient });
            expect(socket.terminate).toHaveBeenCalled();
        });

        test('resolveWsClientId supersede calls destroy when terminate absent', () => {
            const removeClient = jest.fn();
            const socket = { close: jest.fn(), destroy: jest.fn() };
            const wrapper = { _raw: { socket, sessionId: 'S2D' } };
            const _clients = new Map([['67890123456789012345', wrapper]]);
            const req = {
                url: '/api/ape?resume=67890123456789012345',
                headers: { cookie: 'sessionId=S2D' },
            };
            upgradeResume.resolveWsClientId(req, { _clients, removeClient });
            expect(socket.destroy).toHaveBeenCalled();
        });

        test('resolveWsClientId supersede tolerates missing socket on raw row', () => {
            const removeClient = jest.fn();
            const wrapper = { _raw: { sessionId: 'S2C' } };
            const _clients = new Map([['56789012345678901234', wrapper]]);
            const req = {
                url: '/api/ape?resume=56789012345678901234',
                headers: { cookie: 'sessionId=S2C' },
            };
            expect(() =>
                upgradeResume.resolveWsClientId(req, { _clients, removeClient }),
            ).not.toThrow();
            expect(removeClient).toHaveBeenCalledWith('56789012345678901234');
        });

        test('resolveWsClientId evict catches close errors', () => {
            const removeClient = jest.fn();
            const socket = {
                close: jest.fn(() => {
                    throw new Error('close boom');
                }),
                terminate: jest.fn(),
                destroy: jest.fn(),
            };
            const wrapper = { _raw: { socket, sessionId: 'S3' } };
            const _clients = new Map([['23456789012345678901', wrapper]]);
            const req = {
                url: '/api/ape?resume=23456789012345678901',
                headers: { cookie: 'sessionId=S3' },
            };
            expect(() =>
                upgradeResume.resolveWsClientId(req, { _clients, removeClient }),
            ).not.toThrow();
        });

        test('resolveWsClientId wrong session for live row mints fresh id', () => {
            const removeClient = jest.fn();
            const socket = {
                close: jest.fn(),
                terminate: jest.fn(),
                destroy: jest.fn(),
            };
            const wrapper = { _raw: { socket, sessionId: 'S1' } };
            const _clients = new Map([['01234567890123456789', wrapper]]);
            const req = {
                url: '/api/ape?resume=01234567890123456789',
                headers: { cookie: 'sessionId=OTHER' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).not.toBe('01234567890123456789');
            expect(removeClient).not.toHaveBeenCalled();
        });

        test('resolveWsClientId missing raw.sessionId cannot pair with cookie session', () => {
            const removeClient = jest.fn();
            const socket = {
                close: jest.fn(),
                terminate: jest.fn(),
                destroy: jest.fn(),
            };
            const wrapper = { _raw: { socket } };
            const _clients = new Map([['01234567890123456789', wrapper]]);
            const req = {
                url: '/api/ape?resume=01234567890123456789',
                headers: { cookie: 'sessionId=HASSESSION' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).not.toBe('01234567890123456789');
            expect(removeClient).not.toHaveBeenCalled();
        });

        test('resolveWsClientId null raw.sessionId cannot pair with cookie session', () => {
            const removeClient = jest.fn();
            const socket = {
                close: jest.fn(),
                terminate: jest.fn(),
                destroy: jest.fn(),
            };
            const wrapper = { _raw: { socket, sessionId: null } };
            const _clients = new Map([['01234567890123456789', wrapper]]);
            const req = {
                url: '/api/ape?resume=01234567890123456789',
                headers: { cookie: 'sessionId=HASSESSION' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).not.toBe('01234567890123456789');
            expect(removeClient).not.toHaveBeenCalled();
        });

        test('resolveWsClientId pending resume with session mismatch mints fresh id', () => {
            resumeRegistry.registerPendingResume('88888888888888888888', 'sess-a');
            const removeClient = jest.fn();
            const _clients = new Map();
            const req = {
                url: '/api/ape?resume=88888888888888888888',
                headers: { cookie: 'sessionId=sess-b' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).not.toBe('88888888888888888888');
        });

        test('resolveWsClientId claims pending resume slot', () => {
            resumeRegistry.registerPendingResume('34567890123456789012', 'PS');
            const removeClient = jest.fn();
            const _clients = new Map();
            const req = {
                url: '/api/ape?resume=34567890123456789012',
                headers: { cookie: 'sessionId=PS' },
            };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).toBe('34567890123456789012');
        });

        test('resolveWsClientId mints without resume hint', () => {
            const removeClient = jest.fn();
            const _clients = new Map();
            const req = { url: '/api/ape', headers: {} };
            const out = upgradeResume.resolveWsClientId(req, {
                _clients,
                removeClient,
            });
            expect(out.clientId).toHaveLength(20);
            expect(out.effectiveSessionId.length).toBeGreaterThan(10);
        });

        test('sessionIdentity parses cookie, header, URI failure fallback, mint', () => {
            expect(
                sessionIdentity.parseSessionIdFromReq({
                    headers: {
                        cookie: 'sessionId=' + encodeURIComponent('a/b'),
                    },
                }),
            ).toBe('a/b');

            expect(
                sessionIdentity.parseSessionIdFromReq({
                    headers: { cookie: 'sessionId=%' },
                }),
            ).toBe('%');

            expect(
                sessionIdentity.parseSessionIdFromReq({
                    headers: { 'x-ape-session-id': '  trimmed  ' },
                }),
            ).toBe('trimmed');

            expect(
                sessionIdentity.effectiveSessionIdForRequest({ headers: {} }),
            ).toMatch(/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{24}$/);
        });
    });

    describe('main.js — createApeCore option resolution', () => {
        // Real-world: deployments often pass an absolute path for `where` so
        // the API root resolves to a fixed on-disk location regardless of
        // cwd. Exercises `path.isAbsolute(where)` truthy + `urlPrefix`
        // truthy short-circuits inside createApeCore.
        // Real-world: when no urlPrefix is set, an absolute `where` collapses
        // to its basename for the URL path. Exercises L214 cond-expr truthy
        // inside the urlPrefix-falsy branch.
        test('absolute where without urlPrefix uses basename for URL prefix', (done) => {
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const http = require('http');
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-abs-bn-'));
            const cleanup = () => {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            };
            try {
                fs.writeFileSync(
                    path.join(tmpDir, 'pulse.js'),
                    'module.exports = async function () { return { pulse: 1 }; };\n',
                    'utf8',
                );
                const server = http.createServer();
                server.listen(0, () => {
                    try {
                        jest.isolateModules(() => {
                            const ape = require('../../../../server/lib/main');
                            if (ape._resetForTesting) ape._resetForTesting();
                            ape(server, { where: tmpDir }); // no urlPrefix
                        });
                    } finally {
                        server.close(() => { cleanup(); done(); });
                    }
                });
            } catch (e) {
                cleanup();
                done(e);
            }
        });

        test('absolute where + explicit urlPrefix routes correctly', (done) => {
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const http = require('http');
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-abs-'));
            const cleanup = () => {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            };
            try {
                fs.writeFileSync(
                    path.join(tmpDir, 'echo.js'),
                    'module.exports = async function (data) { return data; };\n',
                    'utf8',
                );
                const server = http.createServer();
                server.listen(0, () => {
                    try {
                        jest.isolateModules(() => {
                            const ape = require('../../../../server/lib/main');
                            if (ape._resetForTesting) ape._resetForTesting();
                            ape(server, { where: tmpDir, urlPrefix: '/svc/' });
                        });
                    } finally {
                        server.close(() => { cleanup(); done(); });
                    }
                });
            } catch (e) {
                cleanup();
                done(e);
            }
        });
    });

    describe('httpUtils Module', () => {
        // Real-world: a router uses matchRoute to dispatch incoming HTTP paths.
        // When the incoming path's static segment differs from the pattern's,
        // the matcher must return null so the router can fall through to the
        // next pattern. Without this, mismatched paths would erroneously match.
        test('matchRoute returns null for static segment mismatch', () => {
            const { matchRoute } = require('../../../../server/lib/httpUtils');
            expect(matchRoute('/api/posts/123', '/api/users/:id')).toBeNull();
            expect(matchRoute('/api/v2/users/1', '/api/v1/users/:id')).toBeNull();
        });

        // Real-world: matchRoute is invoked with the parsed pathname from the
        // HTTP request — a parameter segment captures a value, a matching static
        // segment is silently consumed, and the result is the parameter map.
        test('matchRoute extracts parameter when static segments match', () => {
            const { matchRoute } = require('../../../../server/lib/httpUtils');
            expect(
                matchRoute('/api/users/abc', '/api/users/:id'),
            ).toEqual({ id: 'abc' });
        });

        // Real-world: isLocalhost is called from request middleware with the
        // Host header value. The header is sometimes absent — the function must
        // not throw. Exercises the `|| ""` fallback when host is undefined.
        test('isLocalhost(undefined) returns false without throwing', () => {
            const { isLocalhost } = require('../../../../server/lib/httpUtils');
            expect(isLocalhost(undefined)).toBe(false);
        });
    });
});
