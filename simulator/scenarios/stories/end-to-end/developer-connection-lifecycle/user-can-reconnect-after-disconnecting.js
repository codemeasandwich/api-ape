/**
 * User reconnects after disconnect
 */
module.exports = async function userCanReconnectAfterDisconnecting({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // First connection
    const client1 = await harness.createClientForServer(server);
    const result1 = await client1.call('echo', { session: 1 });
    expect(result1.session).toBe(1);

    await client1.disconnect();
    await harness.wait(20);
    expect(server.clientCount).toBe(0);

    // Reconnect (new client instance)
    const client2 = await harness.createClientForServer(server);
    const result2 = await client2.call('echo', { session: 2 });
    expect(result2.session).toBe(2);

    await client2.disconnect();
};
