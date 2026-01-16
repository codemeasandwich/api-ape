/**
 * Test: RPC calls work on each server independently
 */
module.exports = async function rpcCallsWorkOnEachServerIndependently({ harness, expect }) {
    const servers = await harness.createCluster(2, { where: 'test-api' });

    const client1 = await harness.createClientForServer(servers[0]);
    const client2 = await harness.createClientForServer(servers[1]);

    const result1 = await client1.call('echo', { server: 1 });
    const result2 = await client2.call('echo', { server: 2 });

    expect(result1.server).toBe(1);
    expect(result2.server).toBe(2);
};
