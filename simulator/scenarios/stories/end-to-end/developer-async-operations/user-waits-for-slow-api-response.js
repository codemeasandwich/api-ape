/**
 * User waits for slow server response
 */
module.exports = async function userWaitsForSlowApiResponse({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Call delay endpoint
    const start = Date.now();
    const result = await client.call('delay', { ms: 100 });
    const elapsed = Date.now() - start;

    expect(result.delayed).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(90);

    await client.disconnect();
};
