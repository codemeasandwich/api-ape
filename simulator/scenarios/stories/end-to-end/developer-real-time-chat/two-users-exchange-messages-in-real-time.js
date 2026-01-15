/**
 * Complete journey: Two users have a conversation
 *
 * Steps:
 * 1. Server starts with broadcast support
 * 2. Alice joins chat
 * 3. Bob joins chat
 * 4. Alice sends message
 * 5. Bob receives message (Alice doesn't)
 * 6. Bob replies
 * 7. Alice receives reply
 * 8. Both disconnect
 */
module.exports = async function twoUsersExchangeMessagesInRealTime({ harness, expect }) {
    // === STEP 1: Server starts ===
    const server = await harness.createServer({ where: 'test-api' });

    // === STEP 2: Alice joins ===
    const alice = await harness.createClientForServer(server);
    const aliceMessages = [];
    alice.on('message', (msg) => aliceMessages.push(msg));

    // === STEP 3: Bob joins ===
    const bob = await harness.createClientForServer(server);
    const bobMessages = [];
    bob.on('message', (msg) => bobMessages.push(msg));

    // Verify both connected
    expect(server.clientCount).toBe(2);

    // === STEP 4: Alice sends message ===
    const sendResult = await alice.call('message', {
        text: 'Hey Bob!',
        user: 'Alice'
    });
    expect(sendResult.success).toBe(true);

    await harness.wait(20);

    // === STEP 5: Bob receives (Alice doesn't) ===
    expect(bobMessages.length).toBe(1);
    expect(bobMessages[0].data.text).toBe('Hey Bob!');
    expect(aliceMessages.length).toBe(0);

    // === STEP 6: Bob replies ===
    await bob.call('message', {
        text: 'Hi Alice!',
        user: 'Bob'
    });

    await harness.wait(20);

    // === STEP 7: Alice receives reply ===
    expect(aliceMessages.length).toBe(1);
    expect(aliceMessages[0].data.text).toBe('Hi Alice!');

    // === STEP 8: Both disconnect ===
    await alice.disconnect();
    await bob.disconnect();

    await harness.wait(20);
    expect(server.clientCount).toBe(0);
};
