/**
 * User sends many messages rapidly (stress test)
 */
module.exports = async function rapidMessageSendingBetweenUsers({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    const alice = await harness.createClientForServer(server);
    const bob = await harness.createClientForServer(server);

    const bobMessages = [];
    bob.on('message', (msg) => bobMessages.push(msg));

    // Alice sends many messages rapidly
    const messageCount = 20;
    for (let i = 0; i < messageCount; i++) {
        await alice.call('message', { text: `Rapid message ${i}` });
    }

    await harness.wait(100);

    // Bob should receive all messages
    expect(bobMessages.length).toBe(messageCount);

    await alice.disconnect();
    await bob.disconnect();
};
