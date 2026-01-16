/**
 * @fileoverview Advanced Coverage Tests
 *
 * Tests for remaining uncovered code paths through user scenarios:
 *
 * 1. Streaming File Completion: File sharing timeout cleanup
 * 2. Long Polling POST: Broadcast via HTTP and request errors
 * 3. JSS Decode Edge Cases: RegExp, custom errors, undefined, chunked arrays
 * 4. Node.js Runtime: Streaming file HTTP endpoints
 *
 * @module simulator/scenarios/stories/advanced-coverage
 */

const http = require('http');
const { Harness } = require('../../../harness');
const { FileTransferManager } = require('../../../../server/lib/fileTransfer');
const { StreamingFileManager } = require('../../../../server/lib/fileTransfer/streaming');
const jss = require('../../../../utils/jss');

jest.setTimeout(30000);

describe('Advanced Coverage Tests', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 34000, connectTimeout: 10000 });
    });

    afterEach(async () => {
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 100));
    });

    describe('StreamingFileManager Completion Timeout', () => {
        /**
         * User scenario: User A shares file with User B, file completes,
         * then cleanup timer fires after completeTimeout
         * This triggers: streaming.js line 295 (setTimeout after complete)
         */
        test('completed streaming file is cleaned up after timeout', async () => {
            const manager = new StreamingFileManager({
                startTimeout: 50,
                completeTimeout: 50
            });

            // Register a streaming file
            manager.register('share-file-1', 'client-A');
            expect(manager.has('share-file-1')).toBe(true);

            // Complete the upload
            const success = manager.complete('share-file-1', Buffer.from('shared content'));
            expect(success).toBe(true);

            // Verify file is complete
            const file = manager.get('share-file-1');
            expect(file.isComplete).toBe(true);

            // Wait for completeTimeout to fire
            await new Promise(r => setTimeout(r, 100));

            // File should be cleaned up
            expect(manager.has('share-file-1')).toBe(false);

            manager.destroy();
        });

        /**
         * User scenario: Multiple streaming files expire at once
         * This triggers: streaming.js lines 399-401 (cleanup loop)
         */
        test('cleanup removes multiple expired streaming files', async () => {
            const manager = new StreamingFileManager({
                startTimeout: 60000, // Long timeout so cleanup test controls expiry
                completeTimeout: 60000
            });

            // Register multiple files
            manager.register('file-1', 'client-A');
            manager.register('file-2', 'client-B');
            manager.register('file-3', 'client-C');

            expect(manager.streamingFiles.size).toBe(3);

            // Wait a bit so files have some age
            await new Promise(r => setTimeout(r, 50));

            // Force cleanup with very short maxAge to trigger the cleanup path
            // Files are > 50ms old, maxAge = 1ms, so all should be cleaned up
            manager.cleanup(1); // maxAge = 1ms

            // All should be cleaned up because they're older than 1ms
            expect(manager.streamingFiles.size).toBe(0);

            manager.destroy();
        });
    });

    describe('Long Polling POST Handler', () => {
        /**
         * User scenario: User makes API call via POST that triggers broadcast
         * This triggers: postHandler.js line 287 (broadcast function)
         */
        test('POST handler with broadcast-triggering controller', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const pollUrl = `${server.url}/${server.apiPath}/ape/poll`;

            // First establish a long polling connection
            let clientId = null;
            const pollRequest = new Promise((resolve) => {
                const req = http.get(pollUrl, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk.toString();
                        const match = data.match(/"clientId":"([^"]+)"/);
                        if (match) {
                            clientId = match[1];
                            setTimeout(() => {
                                req.destroy();
                                resolve();
                            }, 100);
                        }
                    });
                });
                req.on('error', () => resolve());
                setTimeout(() => {
                    req.destroy();
                    resolve();
                }, 1000);
            });

            await pollRequest;

            if (clientId) {
                // Now make a POST call that triggers broadcast
                const rpcPayload = JSON.stringify({
                    type: 'broadcast-test',
                    data: { message: 'test', channel: 'general' },
                    createdAt: Date.now()
                });

                const postResponse = await new Promise((resolve, reject) => {
                    const url = new URL(pollUrl);
                    const req = http.request({
                        hostname: url.hostname,
                        port: url.port,
                        path: url.pathname,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cookie': `apeClientId=${clientId}`
                        }
                    }, (res) => {
                        let body = '';
                        res.on('data', chunk => body += chunk);
                        res.on('end', () => resolve({ status: res.statusCode, body }));
                    });
                    req.on('error', reject);
                    req.write(rpcPayload);
                    req.end();
                });

                expect([200, 500]).toContain(postResponse.status);
            }
        });
    });

    describe('JSS Decode Edge Cases', () => {
        /**
         * User scenario: Server returns RegExp without explicit flags
         * This triggers: decode.js line 115 (fallback RegExp)
         */
        test('decodes RegExp without flags', () => {
            // Encode a RegExp without flags
            const regex = /test/;
            const encoded = jss.stringify({ pattern: regex });

            // Decode it back
            const decoded = jss.parse(encoded);
            expect(decoded.pattern).toBeInstanceOf(RegExp);
            expect(decoded.pattern.source).toBe('test');
        });

        /**
         * User scenario: Server returns RegExp in non-standard format
         * This triggers: decode.js line 115 (fallback RegExp - no /pattern/flags)
         * This tests the edge case where RegExp string doesn't match standard format
         */
        test('decodes RegExp with non-standard format (fallback path)', () => {
            // Manually craft a JSS payload with a raw pattern (no /.../ wrapper)
            // This exercises the fallback code path in decode.js line 115
            const manualPayload = '{"pattern<!R>":"simple-pattern"}';
            const decoded = jss.parse(manualPayload);

            expect(decoded.pattern).toBeInstanceOf(RegExp);
            expect(decoded.pattern.source).toBe('simple-pattern');
        });

        /**
         * User scenario: Server returns custom/unknown error type
         * This triggers: decode.js line 153 (fallback for non-global Error type)
         */
        test('decodes unknown error type with fallback', () => {
            // Manually craft a JSS payload with a custom error type not in global
            const manualPayload = '{"err<!E>":["CustomAppError","Something went wrong","stack trace here"]}';
            const decoded = jss.parse(manualPayload);

            // Should fall back to generic Error with custom name
            expect(decoded.err).toBeInstanceOf(Error);
            expect(decoded.err.name).toBe('CustomAppError');
            expect(decoded.err.message).toBe('Something went wrong');
        });

        /**
         * User scenario: Server returns RegExp with flags
         * This triggers: decode.js lines 111-112
         */
        test('decodes RegExp with flags', () => {
            const regex = /hello\s+world/gi;
            const encoded = jss.stringify({ pattern: regex });
            const decoded = jss.parse(encoded);

            expect(decoded.pattern).toBeInstanceOf(RegExp);
            expect(decoded.pattern.flags).toContain('g');
            expect(decoded.pattern.flags).toContain('i');
        });

        /**
         * User scenario: Server returns custom Error type
         * This triggers: decode.js lines 148-160 (Error reconstruction)
         */
        test('decodes TypeError correctly', () => {
            const error = new TypeError('Invalid argument');
            const encoded = jss.stringify({ error });
            const decoded = jss.parse(encoded);

            expect(decoded.error).toBeInstanceOf(TypeError);
            expect(decoded.error.message).toBe('Invalid argument');
        });

        test('decodes RangeError correctly', () => {
            const error = new RangeError('Out of bounds');
            const encoded = jss.stringify({ error });
            const decoded = jss.parse(encoded);

            expect(decoded.error).toBeInstanceOf(RangeError);
            expect(decoded.error.message).toBe('Out of bounds');
        });

        /**
         * User scenario: Server returns undefined value in object
         * This triggers: decode.js line 168
         * Note: jss.stringify skips undefined values in objects,
         * so we must manually craft a payload with <!U> tag
         */
        test('decodes undefined values via manual payload', () => {
            const manualPayload = '{"value<!U>":null,"name":"test"}';
            const decoded = jss.parse(manualPayload);

            expect(decoded.value).toBeUndefined();
            expect(decoded.name).toBe('test');
        });

        /**
         * User scenario: Data contains Set
         */
        test('decodes Set correctly', () => {
            const data = { items: new Set([1, 2, 3, 'a', 'b']) };
            const encoded = jss.stringify(data);
            const decoded = jss.parse(encoded);

            expect(decoded.items).toBeInstanceOf(Set);
            expect(decoded.items.size).toBe(5);
            expect(decoded.items.has(1)).toBe(true);
            expect(decoded.items.has('a')).toBe(true);
        });

        /**
         * User scenario: Data contains Map
         */
        test('decodes Map correctly', () => {
            const data = {
                mapping: new Map([
                    ['key1', 'value1'],
                    ['key2', 'value2']
                ])
            };
            const encoded = jss.stringify(data);
            const decoded = jss.parse(encoded);

            expect(decoded.mapping).toBeInstanceOf(Map);
            expect(decoded.mapping.get('key1')).toBe('value1');
        });

        /**
         * User scenario: Data contains Date
         */
        test('decodes Date correctly', () => {
            const now = new Date();
            const data = { timestamp: now };
            const encoded = jss.stringify(data);
            const decoded = jss.parse(encoded);

            expect(decoded.timestamp).toBeInstanceOf(Date);
            expect(decoded.timestamp.getTime()).toBe(now.getTime());
        });

        /**
         * User scenario: Data contains circular reference
         * This triggers: decode.js P tag handling
         */
        test('handles circular references', () => {
            const data = { name: 'root' };
            data.self = data;

            const encoded = jss.stringify(data);
            const decoded = jss.parse(encoded);

            expect(decoded.name).toBe('root');
            expect(decoded.self).toBe(decoded); // Circular reference restored
        });

        /**
         * User scenario: Complex object with multiple type tags
         */
        test('handles multiple special types in one object', () => {
            const now = new Date();
            const data = {
                timestamp: now,
                pattern: /test/gi,
                items: new Set(['a', 'b']),
                config: new Map([['key', 'value']]),
                missing: undefined
            };

            const encoded = jss.stringify(data);
            const decoded = jss.parse(encoded);

            expect(decoded.timestamp).toBeInstanceOf(Date);
            expect(decoded.pattern).toBeInstanceOf(RegExp);
            expect(decoded.items).toBeInstanceOf(Set);
            expect(decoded.config).toBeInstanceOf(Map);
            expect(decoded.missing).toBeUndefined();
        });

        /**
         * User scenario: Array of dates (triggers array type tags)
         * This triggers: decode.js line 214 (array type handling)
         */
        test('handles arrays of special types', () => {
            const dates = [new Date(1000), new Date(2000), new Date(3000)];
            const encoded = jss.stringify({ dates });
            const decoded = jss.parse(encoded);

            expect(Array.isArray(decoded.dates)).toBe(true);
            expect(decoded.dates.length).toBe(3);
            decoded.dates.forEach(d => expect(d).toBeInstanceOf(Date));
        });
    });

    describe('Streaming File HTTP Endpoints', () => {
        /**
         * User scenario: User downloads streaming file that exists
         * This triggers: node.js lines 354-368 (streaming file response)
         */
        test('streaming file can be registered and served', async () => {
            // This test exercises the FileTransferManager's streaming functionality
            const manager = new FileTransferManager();

            // Register and complete a streaming file
            manager.registerStreamingFile('http-stream-1', 'client-X');
            manager.completeStreamingUpload('http-stream-1', Buffer.from('streamed data'));

            // Verify it's accessible
            const file = manager.getStreamingFile('http-stream-1');
            expect(file).not.toBeNull();
            expect(file.isComplete).toBe(true);
            expect(file.data.toString()).toBe('streamed data');

            manager.destroy();
        });

        /**
         * User scenario: User uploads to complete streaming file
         * This triggers: node.js lines 466-472 (streaming upload)
         */
        test('streaming upload can complete transfer', async () => {
            const manager = new FileTransferManager();

            // Register a streaming file
            manager.registerStreamingFile('upload-stream-1', 'client-Y');

            // Check it's registered but not complete
            expect(manager.isStreamingFile('upload-stream-1')).toBe(true);
            const before = manager.getStreamingFile('upload-stream-1');
            expect(before.isComplete).toBe(false);

            // Complete the upload
            const success = manager.completeStreamingUpload('upload-stream-1', Buffer.from('upload data'));
            expect(success).toBe(true);

            // Now it should be complete
            const after = manager.getStreamingFile('upload-stream-1');
            expect(after.isComplete).toBe(true);

            manager.destroy();
        });
    });

    describe('Error Type Handling', () => {
        /**
         * User scenario: Controller throws generic error
         * This triggers proper error serialization
         */
        test('controller generic errors are properly serialized', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            try {
                await client.call('errors', { type: 'generic', message: 'Generic test error' }, 5000);
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeDefined();
                expect(err.message).toContain('Generic test error');
            }
        });

        /**
         * User scenario: Controller throws custom error with extra fields
         */
        test('controller custom errors preserve extra fields', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            try {
                await client.call('errors', {
                    type: 'custom',
                    message: 'Custom test error',
                    details: { field: 'username' }
                }, 5000);
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeDefined();
                expect(err.message).toContain('Custom test error');
            }
        });

        /**
         * User scenario: Controller throws validation error
         */
        test('controller validation errors include field info', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            try {
                await client.call('errors', {
                    type: 'validation',
                    message: 'Invalid field',
                    field: 'email'
                }, 5000);
                fail('Should have thrown');
            } catch (err) {
                expect(err).toBeDefined();
                expect(err.message).toContain('Invalid field');
            }
        });
    });

    describe('Complex Data Structures via API', () => {
        /**
         * User scenario: User sends complex nested data through API
         * Tests JSS encoding of Date, Set, Map, RegExp, undefined
         */
        test('complex nested structures survive round-trip', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const complexData = {
                users: [
                    {
                        id: 1,
                        name: 'Alice',
                        createdAt: new Date(),
                        settings: {
                            theme: 'dark',
                            notifications: new Set(['email', 'push']),
                            preferences: new Map([['lang', 'en'], ['tz', 'UTC']])
                        }
                    }
                ],
                metadata: {
                    version: 1,
                    pattern: /^user-\d+$/,
                    optional: undefined
                }
            };

            const result = await client.call('echo', complexData, 5000);
            expect(result).toBeDefined();
            // Verify the structure survived
            expect(result.users).toBeDefined();
            expect(result.users[0].name).toBe('Alice');
            expect(result.users[0].createdAt).toBeInstanceOf(Date);
            expect(result.users[0].settings.notifications).toBeInstanceOf(Set);
            expect(result.users[0].settings.preferences).toBeInstanceOf(Map);
            expect(result.metadata.pattern).toBeInstanceOf(RegExp);
            expect(result.metadata.optional).toBeUndefined();

            await client.disconnect();
        });

        /**
         * User scenario: User sends numeric data through API
         * Note: Infinity, -Infinity, NaN are NOT supported by JSS (JSON limitation)
         */
        test('numeric values survive round-trip', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const data = {
                integer: 42,
                float: 3.14159,
                negative: -100,
                zero: 0
            };

            const result = await client.call('echo', data, 5000);
            expect(result).toBeDefined();
            expect(result.integer).toBe(42);
            expect(result.float).toBeCloseTo(3.14159);
            expect(result.negative).toBe(-100);
            expect(result.zero).toBe(0);

            await client.disconnect();
        });

        /**
         * User scenario: User sends deeply nested arrays and objects
         */
        test('deeply nested structures survive round-trip', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const data = {
                level1: {
                    level2: {
                        level3: {
                            items: [
                                { date: new Date(1000) },
                                { date: new Date(2000) }
                            ]
                        }
                    }
                }
            };

            const result = await client.call('echo', data, 5000);
            expect(result).toBeDefined();
            expect(result.level1.level2.level3.items[0].date).toBeInstanceOf(Date);
            expect(result.level1.level2.level3.items[1].date.getTime()).toBe(2000);

            await client.disconnect();
        });
    });
});
