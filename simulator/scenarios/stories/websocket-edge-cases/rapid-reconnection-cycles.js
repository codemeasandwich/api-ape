/**
 * Test: rapid reconnection - disconnect/reconnect cycles
 *
 * Tests that a client can rapidly disconnect and reconnect
 * multiple times without issues.
 */
module.exports = async function rapidReconnectionCycles({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // Perform multiple disconnect/reconnect cycles
    const cycles = 5;

    for (let i = 0; i < cycles; i++) {
        // Create and connect a new client
        const client = await harness.createClientForServer(server);
        expect(client.connected).toBe(true);

        // Verify the connection works
        const result = await client.call('echo', { cycle: i });
        expect(result.cycle).toBe(i);

        // Disconnect
        await client.disconnect();
        expect(client.connected).toBe(false);

        // Small delay between cycles
        await harness.wait(10);
    }

    // Final verification - connect one more time
    const finalClient = await harness.createClientForServer(server);
    expect(finalClient.connected).toBe(true);

    const finalResult = await finalClient.call('echo', { final: true });
    expect(finalResult.final).toBe(true);
};
