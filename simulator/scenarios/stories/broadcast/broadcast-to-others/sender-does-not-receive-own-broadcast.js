/**
 * Test: sender does not receive their own broadcast
 */
module.exports = async function senderDoesNotReceiveOwnBroadcast({ harness, expect }) {
    const { server, clients } = await harness.createGroup(3, {
        where: 'test-api'
    });

    const [alice, bob, charlie] = clients;
    const aliceMessages = [];
    const bobMessages = [];
    const charlieMessages = [];

    alice.on('message', (msg) => aliceMessages.push(msg));
    bob.on('message', (msg) => bobMessages.push(msg));
    charlie.on('message', (msg) => charlieMessages.push(msg));

    // Alice sends a message
    await alice.call('message', { text: 'Hello everyone!', user: 'Alice' });

    // Wait for broadcasts
    await harness.wait(20);

    // Alice should NOT receive (broadcastOthers)
    expect(aliceMessages.length).toBe(0);

    // Bob and Charlie should receive
    expect(bobMessages.length).toBe(1);
    expect(charlieMessages.length).toBe(1);

    expect(bobMessages[0].data.text).toBe('Hello everyone!');
    expect(bobMessages[0].data.user).toBe('Alice');
};
