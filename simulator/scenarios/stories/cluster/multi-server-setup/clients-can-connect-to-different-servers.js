/**
 * Test: clients can connect to different servers
 */
module.exports = async function clientsCanConnectToDifferentServers({ harness, expect }) {
    const servers = await harness.createCluster(2, { where: 'test-api' });

    const client1 = await harness.createClientForServer(servers[0]);
    const client2 = await harness.createClientForServer(servers[1]);

    expect(client1.connected).toBe(true);
    expect(client2.connected).toBe(true);

    // Each server should have 1 client
    await harness.waitFor(() => servers[0].clientCount >= 1);
    await harness.waitFor(() => servers[1].clientCount >= 1);
};
