/**
 * User sends RangeError (specific error type)
 */
module.exports = async function rangeErrorSurvivesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const rangeError = new RangeError('Index out of bounds');
    const result = await client.call('types', { error: rangeError });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Index out of bounds');

    await client.disconnect();
};
