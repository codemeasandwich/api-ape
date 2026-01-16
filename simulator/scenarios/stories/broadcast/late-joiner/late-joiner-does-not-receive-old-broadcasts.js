/**
 * Test: late joiner does not receive old broadcasts
 */
module.exports = async function lateJoinerDoesNotReceiveOldBroadcasts({ harness, expect }) {
    const { server, clients } = await harness.createGroup(2, {
        where: 'test-api'
    });

    const [alice, bob] = clients;

    // Alice sends before Charlie joins
    await alice.call('message', { text: 'Before Charlie' });
    await harness.wait(20);

    // Charlie joins late
    const charlie = await harness.createClientForServer(server);
    const charlieMessages = [];
    charlie.on('message', (msg) => charlieMessages.push(msg));

    // Alice sends after Charlie joins
    await alice.call('message', { text: 'After Charlie' });
    await harness.wait(20);

    // Charlie should only receive the second message
    expect(charlieMessages.length).toBe(1);
    expect(charlieMessages[0].data.text).toBe('After Charlie');
};
