/**
 * User connects to different servers for different features
 */
module.exports = async function clientCanConnectToMultipleServers({ harness, expect }) {
    const server1 = await harness.createServer({ where: 'test-api' });
    const server2 = await harness.createServer({ where: 'test-api' });

    const client1 = await harness.createClientForServer(server1);
    const client2 = await harness.createClientForServer(server2);

    // Both can make calls
    const result1 = await client1.call('echo', { server: 1 });
    const result2 = await client2.call('echo', { server: 2 });

    expect(result1.server).toBe(1);
    expect(result2.server).toBe(2);

    await client1.disconnect();
    await client2.disconnect();
};
