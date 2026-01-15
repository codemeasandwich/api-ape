/**
 * User disconnects quickly after connecting
 */
module.exports = async function rapidConnectDisconnectCycle({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // Rapid connect/disconnect cycles
    for (let i = 0; i < 3; i++) {
        const client = await harness.createClientForServer(server);
        expect(client.connected).toBe(true);
        await client.disconnect();
        await harness.wait(20);
        expect(client.connected).toBe(false);
    }

    await harness.wait(30);
    expect(server.clientCount).toBe(0);
};
