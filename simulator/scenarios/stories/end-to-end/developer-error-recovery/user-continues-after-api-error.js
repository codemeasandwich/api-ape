/**
 * User recovers after hitting an error
 */
module.exports = async function userContinuesAfterApiError({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Make a successful call
    const result1 = await client.call('echo', { step: 1 });
    expect(result1.step).toBe(1);

    // Hit an error
    await expect(
        client.call('errors', { type: 'generic', message: 'Oops' })
    ).rejects.toThrow();

    // Continue with more successful calls
    const result2 = await client.call('echo', { step: 2 });
    expect(result2.step).toBe(2);

    const result3 = await client.call('echo', { step: 3 });
    expect(result3.step).toBe(3);

    await client.disconnect();
};
