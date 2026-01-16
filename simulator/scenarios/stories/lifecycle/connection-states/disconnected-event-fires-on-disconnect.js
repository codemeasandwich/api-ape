/**
 * Test: disconnected event fires on disconnect
 */
module.exports = async function disconnectedEventFiresOnDisconnect({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    let disconnectedFired = false;
    client.on('disconnected', () => {
        disconnectedFired = true;
    });

    await client.disconnect();

    expect(disconnectedFired).toBe(true);
};
