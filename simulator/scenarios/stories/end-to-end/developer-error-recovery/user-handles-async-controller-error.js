/**
 * User handles async error correctly
 */
module.exports = async function userHandlesAsyncControllerError({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Async error should still propagate
    await expect(
        client.call('errors', { type: 'async', message: 'Delayed error' })
    ).rejects.toThrow();

    // Connection still works
    const result = await client.call('echo', { recovered: true });
    expect(result.recovered).toBe(true);

    await client.disconnect();
};
