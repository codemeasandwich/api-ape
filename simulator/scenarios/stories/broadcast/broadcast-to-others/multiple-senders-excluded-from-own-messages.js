/**
 * Test: multiple senders each excluded from their own messages
 */
module.exports = async function multipleSendersExcludedFromOwnMessages({ harness, expect }) {
    const { clients } = await harness.createGroup(3, { where: 'test-api' });
    const [alice, bob, charlie] = clients;

    const received = {
        alice: [],
        bob: [],
        charlie: []
    };

    alice.on('message', (msg) => received.alice.push(msg));
    bob.on('message', (msg) => received.bob.push(msg));
    charlie.on('message', (msg) => received.charlie.push(msg));

    // Each person sends a message
    await alice.call('message', { text: 'Hi from Alice' });
    await bob.call('message', { text: 'Hi from Bob' });
    await charlie.call('message', { text: 'Hi from Charlie' });

    await harness.wait(20);

    // Each person should receive 2 messages (from the other 2 people)
    expect(received.alice.length).toBe(2);
    expect(received.bob.length).toBe(2);
    expect(received.charlie.length).toBe(2);

    // Each should NOT have their own message
    expect(received.alice.every((m) => m.data.text !== 'Hi from Alice')).toBe(
        true
    );
    expect(received.bob.every((m) => m.data.text !== 'Hi from Bob')).toBe(
        true
    );
    expect(
        received.charlie.every((m) => m.data.text !== 'Hi from Charlie')
    ).toBe(true);
};
