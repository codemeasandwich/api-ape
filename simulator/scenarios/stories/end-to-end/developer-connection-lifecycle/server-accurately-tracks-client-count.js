/**
 * Server tracks clients joining and leaving
 */
module.exports = async function serverAccuratelyTracksClientCount({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    expect(server.clientCount).toBe(0);

    const c1 = await harness.createClientForServer(server);
    expect(server.clientCount).toBe(1);

    const c2 = await harness.createClientForServer(server);
    expect(server.clientCount).toBe(2);

    const c3 = await harness.createClientForServer(server);
    expect(server.clientCount).toBe(3);

    await c1.disconnect();
    await harness.wait(20);
    expect(server.clientCount).toBe(2);

    await c2.disconnect();
    await c3.disconnect();
    await harness.wait(20);
    expect(server.clientCount).toBe(0);
};
