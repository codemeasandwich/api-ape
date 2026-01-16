/**
 * Test: waitFor returns existing buffered message
 */
module.exports = async function waitForReturnsExistingBufferedMessage({ harness, expect }) {
    const { clients } = await harness.createGroup(2, { where: 'test-api' });
    const [alice, bob] = clients;

    // Register handler to enable buffering
    bob.on('message', () => { });

    // Alice sends
    await alice.call('message', { text: 'Buffered test' });
    await harness.wait(20);

    // Bob should find the buffered message
    const msg = await bob.waitFor('message', 200);
    expect(msg.data.text).toBe('Buffered test');
};
