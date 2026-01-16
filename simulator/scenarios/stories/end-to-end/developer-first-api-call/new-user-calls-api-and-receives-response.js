/**
 * Complete journey: Developer sets up server, user makes first API call
 *
 * Steps:
 * 1. Developer creates server with ape()
 * 2. User opens webpage (client connects)
 * 3. User triggers action that calls api.echo()
 * 4. User sees the response
 * 5. User closes page (disconnects)
 */
module.exports = async function newUserCallsApiAndReceivesResponse({ harness, expect }) {
    // === STEP 1: Developer creates server ===
    const server = await harness.createServer({ where: 'test-api' });
    expect(server).toBeDefined();

    // === STEP 2: User opens webpage ===
    const client = await harness.createClientForServer(server);
    expect(client.connected).toBe(true);

    // === STEP 3: User triggers API call ===
    const result = await client.call('echo', {
        greeting: 'Hello World!',
        timestamp: Date.now()
    });

    // === STEP 4: User receives response ===
    expect(result.greeting).toBe('Hello World!');
    expect(result.timestamp).toBeDefined();

    // === STEP 5: User closes page ===
    await client.disconnect();
    expect(client.connected).toBe(false);
};
