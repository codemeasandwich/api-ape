/**
 * @file Shared Integration Test Scenarios
 *
 * These scenarios test api-ape's core functionality across different runtimes.
 * Each runtime adapter imports and runs these scenarios. `messageHash` is
 * exported too, so a runner can compute the queryId of its own extra calls.
 */

// Jenkins one-at-a-time hash + Base32 encoding (same as api-ape)
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Encode a non-negative integer in api-ape's Base32 alphabet.
 *
 * @param {number} n - Non-negative integer
 * @returns {string} Base32 digits, most significant first
 */
function toBase32(n) {
    const remainder = Math.floor(n / 32);
    const current = n % 32;
    if (0 === remainder) return alphabet[current];
    return toBase32(remainder) + alphabet[current];
}
/**
 * Jenkins one-at-a-time hash of a string, as an unsigned 32-bit integer.
 *
 * @param {string} str - Input text
 * @returns {number} Unsigned 32-bit hash
 */
function jenkinsHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash += str.charCodeAt(i);
        hash += hash << 10;
        hash ^= hash >> 6;
    }
    hash += hash << 3;
    hash ^= hash >> 11;
    return ((hash + (hash << 15)) & 4294967295) >>> 0;
}
/**
 * The queryId api-ape gives a request: Base32 of the Jenkins hash of the
 * exact JSON text sent.
 *
 * @param {string} msg - The JSON text of the request
 * @returns {string} The queryId the server will answer with
 */
function messageHash(msg) {
    return toBase32(jenkinsHash(msg));
}

/**
 * Test scenario definitions
 * Each scenario has:
 * - name: Human-readable name
 * - description: What it tests
 * - run: Async function that performs the test
 */
const scenarios = [
    {
        name: 'WebSocket Connection',
        description: 'Client can connect via WebSocket',
        run: async ({ server, WebSocket, expect }) => {
            const ws = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);

            await new Promise((resolve, reject) => {
                ws.onopen = resolve;
                ws.onerror = reject;
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });

            expect(ws.readyState).toBe(WebSocket.OPEN);
            ws.close(1000);
        }
    },
    {
        name: 'RPC Call',
        description: 'Can call a controller and get response',
        run: async ({ server, WebSocket, expect }) => {
            const ws = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);

            await new Promise(resolve => { ws.onopen = resolve; });

            // Build message and compute queryId same as api-ape
            const payload = { type: 'types', data: { message: 'hello' } };
            const message = JSON.stringify(payload);
            const queryId = messageHash(message);

            const response = await new Promise((resolve, reject) => {
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    // api-ape responds with queryId computed from message hash
                    if (data.queryId === queryId) {
                        resolve(data);
                    }
                };
                ws.onerror = reject;

                ws.send(message);

                setTimeout(() => reject(new Error('RPC timeout')), 5000);
            });

            expect(response.data).toBeDefined();
            expect(response.data.success).toBe(true);
            ws.close(1000);
        }
    },
    {
        name: 'Binary Data Transfer',
        description: 'Can send and receive binary data',
        run: async ({ server, WebSocket, expect, Buffer }) => {
            const ws = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);

            await new Promise(resolve => { ws.onopen = resolve; });

            const testBuffer = Buffer.from([0x00, 0x01, 0x02, 0xFF]);

            // Build message with JSS-encoded binary and compute queryId
            const payload = {
                type: 'types',
                data: {
                    buffer: { '<!B>': testBuffer.toString('base64') }
                }
            };
            const message = JSON.stringify(payload);
            const queryId = messageHash(message);

            const response = await new Promise((resolve, reject) => {
                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.queryId === queryId) {
                            resolve(data);
                        }
                    } catch {
                        // Binary message, ignore
                    }
                };
                ws.onerror = reject;

                ws.send(message);

                setTimeout(() => reject(new Error('Binary transfer timeout')), 5000);
            });

            expect(response.data).toBeDefined();
            expect(response.data.success).toBe(true);
            ws.close(1000);
        }
    },
    {
        name: 'Broadcast Message',
        description: 'Server can broadcast to connected clients',
        run: async ({ server, WebSocket, expect }) => {
            const ws1 = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);
            const ws2 = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);

            await Promise.all([
                new Promise(resolve => { ws1.onopen = resolve; }),
                new Promise(resolve => { ws2.onopen = resolve; })
            ]);

            // ws2 should receive broadcast from ws1's action
            const broadcastPromise = new Promise((resolve, reject) => {
                ws2.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'test-broadcast') {
                        resolve(data);
                    }
                };
                setTimeout(() => reject(new Error('Broadcast timeout')), 5000);
            });

            // Trigger broadcast from ws1
            ws1.send(JSON.stringify({
                type: 'users/create',
                data: { name: 'TestUser' }
            }));

            const broadcast = await broadcastPromise;
            expect(broadcast.type).toBe('test-broadcast');

            ws1.close(1000);
            ws2.close(1000);
        }
    },
    {
        name: 'Error Handling',
        description: 'Server returns errors for invalid requests',
        run: async ({ server, WebSocket, expect }) => {
            const ws = new WebSocket(`ws://localhost:${server.port}/${server.apiPath}/ape`);

            await new Promise(resolve => { ws.onopen = resolve; });

            // Build message for non-existent endpoint and compute queryId
            const payload = { type: 'nonexistent/endpoint', data: {} };
            const message = JSON.stringify(payload);
            const queryId = messageHash(message);

            const response = await new Promise((resolve, reject) => {
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.queryId === queryId) {
                        resolve(data);
                    }
                };
                ws.onerror = reject;

                ws.send(message);

                setTimeout(() => reject(new Error('Error response timeout')), 5000);
            });

            // Should get an error response. Since 4.4.0 `err` is an Error carried by JSS, so a
            // plain JSON reader sees the tagged key `err<!E>` = [name, message, stack].
            const err = response['err<!E>'] || response.err;
            expect(err).toBeTruthy();
            expect(String(Array.isArray(err) ? err[1] : err).includes('was not found')).toBeTruthy();
            ws.close(1000);
        }
    }
];

module.exports = { scenarios, messageHash };
