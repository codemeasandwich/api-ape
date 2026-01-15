/**
 * Controller returns nothing (void)
 */
module.exports = async function controllerThatReturnsNothingWorks({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Echo with no data should still work
    const result = await client.call('echo', {});
    expect(result).toEqual({});

    await client.disconnect();
};
