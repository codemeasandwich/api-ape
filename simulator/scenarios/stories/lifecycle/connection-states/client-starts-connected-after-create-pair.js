/**
 * Test: client starts connected after createPair
 */
module.exports = async function clientStartsConnectedAfterCreatePair({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    expect(client.connected).toBe(true);
    expect(client.state).toBe('connected');
};
