/**
 * User sends very large payload
 */
module.exports = async function largePayloadTransmittedCorrectly({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Create object with many properties
    const largeData = {};
    for (let i = 0; i < 100; i++) {
        largeData[`key_${i}`] = `value_${i}_${'x'.repeat(100)}`;
    }

    const result = await client.call('echo', largeData);

    expect(Object.keys(result).length).toBe(100);
    expect(result.key_50).toContain('value_50');

    await client.disconnect();
};
