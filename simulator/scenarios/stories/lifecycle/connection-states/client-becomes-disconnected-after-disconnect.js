/**
 * Test: client becomes disconnected after disconnect
 */
module.exports = async function clientBecomesDisconnectedAfterDisconnect({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    expect(client.connected).toBe(true);

    await client.disconnect();

    expect(client.connected).toBe(false);
    expect(client.state).toBe('disconnected');
};
