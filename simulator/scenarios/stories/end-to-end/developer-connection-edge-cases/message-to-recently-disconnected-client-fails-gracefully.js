/**
 * Server sends to client that just disconnected
 * This exercises the socket state checking code
 */
module.exports = async function messageToRecentlyDisconnectedClientFailsGracefully({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    const alice = await harness.createClientForServer(server);
    const bob = await harness.createClientForServer(server);

    bob.on('message', () => { });

    // Bob disconnects
    await bob.disconnect();
    await harness.wait(20);

    // Alice sends - should not throw, just log
    const result = await alice.call('message', { text: 'Hello Bob!' });
    expect(result.success).toBe(true);

    await alice.disconnect();
};
