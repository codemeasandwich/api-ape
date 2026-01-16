/**
 * @fileoverview HTTP Transport User Stories
 *
 * Tests HTTP long-polling transport as fallback when WebSocket is unavailable.
 * Covers:
 * - HTTP GET streaming for server-to-client messages
 * - HTTP POST for client-to-server messages
 * - Cookie-based session management
 * - Reconnection after stream ends
 *
 * @module simulator/scenarios/stories/http-transport
 */

const { Harness } = require('../../../harness');

jest.setTimeout(15000);

describe('HTTP Transport User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 16000, connectTimeout: 5000 });
    });

    afterEach(async () => {
        await harness.cleanup();
        // Allow server-side cleanup handlers to fire
        await new Promise(r => setTimeout(r, 50));
    });

    describe('Basic HTTP Polling', () => {
        test('client can connect via HTTP polling', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            expect(client.connected).toBe(true);
            expect(client.transport).toBe('polling');

            await client.disconnect();
        });

        test('client can make RPC call via HTTP polling', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            const result = await client.call('echo', { message: 'Hello via HTTP!' });

            expect(result.message).toBe('Hello via HTTP!');

            await client.disconnect();
        });

        test('client receives broadcasts via HTTP polling', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const alice = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });
            const bob = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            const received = [];
            bob.on('message', (msg) => received.push(msg));

            await alice.call('message', { text: 'Hello Bob!' });
            await harness.wait(100);

            expect(received.length).toBe(1);
            expect(received[0].data.text).toBe('Hello Bob!');

            await alice.disconnect();
            await bob.disconnect();
        });
    });

    describe('Mixed Transport', () => {
        test('WebSocket and polling clients can communicate', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const wsClient = await harness.createClientForServer(server, {
                transport: 'websocket'
            });
            const pollingClient = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            const wsReceived = [];
            const pollingReceived = [];

            wsClient.on('message', (msg) => wsReceived.push(msg));
            pollingClient.on('message', (msg) => pollingReceived.push(msg));

            // WS client sends
            await wsClient.call('message', { text: 'From WS' });
            await harness.wait(100);

            // Polling client should receive
            expect(pollingReceived.length).toBe(1);

            // Polling client sends
            await pollingClient.call('message', { text: 'From Polling' });
            await harness.wait(100);

            // WS client should receive
            expect(wsReceived.length).toBe(1);

            await wsClient.disconnect();
            await pollingClient.disconnect();
        });
    });

    describe('HTTP Polling Error Handling', () => {
        test('polling client handles invalid endpoint gracefully', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            await expect(
                client.call('nonexistent/endpoint', {})
            ).rejects.toThrow();

            // Client should still be connected
            expect(client.connected).toBe(true);

            await client.disconnect();
        });

        test('polling client handles controller errors', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            await expect(
                client.call('errors', { type: 'thrown' })
            ).rejects.toThrow();

            await client.disconnect();
        });
    });

    describe('HTTP Polling with Complex Data', () => {
        test('complex JSS types work via HTTP polling', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            const testDate = new Date('2024-01-15T12:00:00Z');
            const testSet = new Set([1, 2, 3]);
            const testMap = new Map([['a', 1], ['b', 2]]);

            const result = await client.call('types', {
                date: testDate,
                set: testSet,
                map: testMap
            });

            expect(result.date).toEqual(testDate);
            expect(result.set).toEqual(testSet);
            expect(result.map).toEqual(testMap);

            await client.disconnect();
        });
    });

    describe('HTTP Polling Session Management', () => {
        test('polling client maintains session across requests', async () => {
            const server = await harness.createServer({
                where: 'test-api',
                onConnect: (socket, req, send) => ({
                    embed: { sessionId: 'test-session-123' }
                })
            });

            const client = await harness.createClientForServer(server, {
                transport: 'polling',
                connectTimeout: 5000
            });

            // Multiple calls should use same session
            const result1 = await client.call('users/profile', {});
            const result2 = await client.call('users/profile', {});

            expect(result1.sessionId).toBe('test-session-123');
            expect(result2.sessionId).toBe('test-session-123');

            await client.disconnect();
        });
    });
});
