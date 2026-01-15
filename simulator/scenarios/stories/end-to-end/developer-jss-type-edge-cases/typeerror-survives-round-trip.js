/**
 * User sends TypeError (specific error type)
 */
module.exports = async function typeErrorSurvivesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const typeError = new TypeError('Cannot read property x of null');
    const result = await client.call('types', { error: typeError });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Cannot read property x of null');

    await client.disconnect();
};
