/**
 * Complete journey: User joins late and misses history
 */
module.exports = async function lateJoinerMissesPreviousMessages({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // Alice and Bob join first
    const alice = await harness.createClientForServer(server);
    const bob = await harness.createClientForServer(server);

    bob.on('message', () => { });  // Bob listens

    // Alice sends messages before Charlie joins
    await alice.call('message', { text: 'Message 1' });
    await alice.call('message', { text: 'Message 2' });
    await harness.wait(20);

    // Charlie joins AFTER messages were sent
    const charlie = await harness.createClientForServer(server);
    const charlieMessages = [];
    charlie.on('message', (msg) => charlieMessages.push(msg));

    // Charlie should have received 0 messages (joined late)
    expect(charlieMessages.length).toBe(0);

    // Now Alice sends a new message
    await alice.call('message', { text: 'Message 3' });
    await harness.wait(20);

    // NOW Charlie receives (but only the new one)
    expect(charlieMessages.length).toBe(1);
    expect(charlieMessages[0].data.text).toBe('Message 3');

    // Cleanup
    await alice.disconnect();
    await bob.disconnect();
    await charlie.disconnect();
};
