/**
 * Test: clients can connect to servers in cluster
 */
module.exports = async function clientsCanConnectToServersInCluster({ harness, expect }) {
    const servers = await harness.createCluster(2, { where: 'test-api' });

    const client1 = await harness.createClientForServer(servers[0]);
    const client2 = await harness.createClientForServer(servers[0]);
    const client3 = await harness.createClientForServer(servers[1]);

    // All clients should be connected
    expect(client1.connected).toBe(true);
    expect(client2.connected).toBe(true);
    expect(client3.connected).toBe(true);

    // Verify clients can make RPC calls
    const results = await Promise.all([
        client1.call('echo', { id: 1 }),
        client2.call('echo', { id: 2 }),
        client3.call('echo', { id: 3 })
    ]);

    expect(results.map((r) => r.id)).toEqual([1, 2, 3]);
};
