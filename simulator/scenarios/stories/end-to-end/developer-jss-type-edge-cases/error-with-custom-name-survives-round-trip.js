/**
 * User sends Error with custom properties
 */
module.exports = async function errorWithCustomNameSurvivesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const customError = new Error('Custom error message');
    customError.name = 'CustomAppError';

    const result = await client.call('types', { error: customError });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Custom error message');

    await client.disconnect();
};
