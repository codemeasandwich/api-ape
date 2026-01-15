/**
 * Test: rapid message exchange between two users
 *
 * Tests that two users can exchange messages rapidly back and forth,
 * with each user correctly receiving only the other user's messages.
 */
module.exports = async function rapidMessageExchangeBetweenTwoUsers({ harness, expect }) {
    const { server, clients } = await harness.createGroup(2, {
        where: 'test-api'
    });

    const [alice, bob] = clients;

    const aliceReceived = [];
    const bobReceived = [];

    alice.on('message', (msg) => aliceReceived.push(msg));
    bob.on('message', (msg) => bobReceived.push(msg));

    // Exchange 10 messages back and forth
    for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
            await alice.call('message', { text: `Alice-${i}` });
        } else {
            await bob.call('message', { text: `Bob-${i}` });
        }
    }

    await harness.wait(50);

    // Alice sent 5, should receive 5 (from Bob)
    // Bob sent 5, should receive 5 (from Alice)
    expect(aliceReceived.length).toBe(5);
    expect(bobReceived.length).toBe(5);

    // Verify correct messages received
    expect(aliceReceived.every((m) => m.data.text.startsWith('Bob-'))).toBe(
        true
    );
    expect(bobReceived.every((m) => m.data.text.startsWith('Alice-'))).toBe(
        true
    );
};
