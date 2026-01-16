/**
 * Test: concurrent reconnection from multiple clients
 *
 * Tests that multiple clients can disconnect and reconnect
 * simultaneously without causing server issues.
 */
module.exports = async function concurrentReconnectionMultipleClients({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // Create initial set of clients
    const clientCount = 5;
    let clients = [];
    for (let i = 0; i < clientCount; i++) {
        const client = await harness.createClientForServer(server);
        clients.push(client);
    }

    // Verify all connected
    expect(clients.every(c => c.connected)).toBe(true);

    // Disconnect all simultaneously
    await Promise.all(clients.map(c => c.disconnect()));

    // Verify all disconnected
    expect(clients.every(c => !c.connected)).toBe(true);

    // Reconnect all simultaneously
    const reconnectPromises = [];
    for (let i = 0; i < clientCount; i++) {
        reconnectPromises.push(harness.createClientForServer(server));
    }
    clients = await Promise.all(reconnectPromises);

    // Verify all reconnected
    expect(clients.every(c => c.connected)).toBe(true);

    // Verify all can make calls
    const results = await Promise.all(
        clients.map((c, i) => c.call('echo', { clientIndex: i }))
    );

    results.forEach((result, i) => {
        expect(result.clientIndex).toBe(i);
    });
};
