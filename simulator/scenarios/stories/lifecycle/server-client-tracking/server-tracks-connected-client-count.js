/**
 * Test: server tracks connected client count
 */
module.exports = async function serverTracksConnectedClientCount({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    expect(server.clientCount).toBe(0);

    const client1 = await harness.createClientForServer(server);
    await harness.waitFor(() => server.clientCount >= 1);

    const client2 = await harness.createClientForServer(server);
    await harness.waitFor(() => server.clientCount >= 2);

    expect(server.clientCount).toBe(2);

    await client1.disconnect();
    await harness.wait(20);

    expect(server.clientCount).toBe(1);
};
