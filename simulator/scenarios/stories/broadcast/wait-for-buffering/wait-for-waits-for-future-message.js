/**
 * Test: waitFor waits for future message
 */
module.exports = async function waitForWaitsForFutureMessage({ harness, expect }) {
    const { clients } = await harness.createGroup(2, { where: 'test-api' });
    const [alice, bob] = clients;

    // Start waiting before message is sent
    const waitPromise = bob.waitFor('message', 500);

    // Send after a small delay - use immediate to schedule after waitFor is set up
    await harness.wait(20);
    await alice.call('message', { text: 'Future message' });

    const msg = await waitPromise;
    expect(msg.data.text).toBe('Future message');
};
