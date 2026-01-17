/**
 * @fileoverview Broadcast Proxy User Stories
 *
 * Tests the ape.clients proxy behavior:
 * - Read-only access to connected clients
 * - Mutation prevention (set, delete, clear)
 * - Proper method binding (forEach, get, has, etc.)
 *
 * @module simulator/scenarios/stories/broadcast-proxy
 */

const { Harness } = require('../../../harness');

jest.setTimeout(10000);

describe('Broadcast Proxy User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 26000, connectTimeout: 5000 });
    });

    afterEach(async () => {
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 50));
    });

    describe('Read-Only Client Access', () => {
        test('can access clients size', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'size' });

            expect(result.success).toBe(true);
            expect(result.size).toBe(1); // One connected client
            expect(result.sizeType).toBe('number');
        });

        test('can iterate with forEach', async () => {
            const { server, client } = await harness.createPair({ where: 'test-api' });

            // Connect another client
            const client2 = await harness.createClientForServer(server);

            const result = await client.call('broadcast-test', { action: 'forEach' });

            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.clients).toHaveLength(2);
            expect(result.clients[0].hasClientId).toBe(true);
            expect(result.clients[0].hasSendTo).toBe(true);

            await client2.disconnect();
        });

        test('can get specific client', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'get' });

            expect(result.success).toBe(true);
            expect(result.hasClient).toBe(true);
            expect(result.clientId).toBeDefined();
            expect(result.hasEmbed).toBe(true);
        });

        test('can check if client exists with has', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'has' });

            expect(result.success).toBe(true);
            expect(result.hasFirst).toBe(true);
            expect(result.hasNonExistent).toBe(false);
        });

        test('can iterate keys', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'keys' });

            expect(result.success).toBe(true);
            expect(result.keys).toHaveLength(1);
            expect(typeof result.keys[0]).toBe('string');
        });

        test('can iterate values', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'values' });

            expect(result.success).toBe(true);
            expect(result.values).toHaveLength(1);
            expect(result.values[0].clientId).toBeDefined();
            expect(result.values[0].hasEmbed).toBe(true);
        });

        test('can iterate entries', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'entries' });

            expect(result.success).toBe(true);
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].key).toBeDefined();
            expect(result.entries[0].clientId).toBeDefined();
        });

        test('can access client sessionId', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'sessionId' });

            expect(result.success).toBe(true);
            // sessionId is null when no session cookie is set
            expect(result.sessionId).toBeNull();
        });

        test('can access client agent', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'agent' });

            expect(result.success).toBe(true);
            expect(result.hasAgent).toBe(true);
            expect(result.agent).toBeDefined();
        });

        test('can send client', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'send' });

            expect(result.success).toBe(true);
            expect(result.sentMessage).toBe(true);

            // Wait for the message to arrive
            const ping = await client.waitFor('broadcast-test-ping', 1000);
            expect(ping.data.timestamp).toBeDefined();
        });
    });

    describe('Mutation Prevention', () => {
        test('set operation is blocked', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'mutate-set' });

            expect(result.success).toBe(true);
            expect(result.mutationBlocked).toBe(true);
            expect(result.errorMessage).toContain('ape.clients.set()');
            expect(result.errorMessage).toContain('not allowed');
        });

        test('delete operation is blocked', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'mutate-delete' });

            expect(result.success).toBe(true);
            expect(result.mutationBlocked).toBe(true);
            expect(result.errorMessage).toContain('ape.clients.delete()');
            expect(result.errorMessage).toContain('not allowed');
        });

        test('clear operation is blocked', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('broadcast-test', { action: 'mutate-clear' });

            expect(result.success).toBe(true);
            expect(result.mutationBlocked).toBe(true);
            expect(result.errorMessage).toContain('ape.clients.clear()');
            expect(result.errorMessage).toContain('not allowed');
        });
    });

    describe('Multiple Clients', () => {
        test('tracks multiple connected clients', async () => {
            const { server, client } = await harness.createPair({ where: 'test-api' });

            // Connect more clients
            const client2 = await harness.createClientForServer(server);
            const client3 = await harness.createClientForServer(server);

            const result = await client.call('broadcast-test', { action: 'size' });

            expect(result.success).toBe(true);
            expect(result.size).toBe(3);

            await client2.disconnect();
            await client3.disconnect();
        });

        test('updates size when clients disconnect', async () => {
            const { server, client } = await harness.createPair({ where: 'test-api' });

            const client2 = await harness.createClientForServer(server);

            // Verify 2 clients
            const result1 = await client.call('broadcast-test', { action: 'size', _t: 1 });
            expect(result1.size).toBe(2);

            // Disconnect one
            await client2.disconnect();
            await harness.wait(100); // Wait for disconnect to process

            // Verify 1 client
            const result2 = await client.call('broadcast-test', { action: 'size', _t: 2 });
            expect(result2.size).toBe(1);
        });
    });
});
