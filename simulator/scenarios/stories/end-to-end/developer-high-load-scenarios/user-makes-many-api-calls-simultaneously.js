/**
 * User makes many concurrent API calls
 */
module.exports = async function userMakesManyApiCallsSimultaneously({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Send 20 concurrent calls
    const callCount = 20;
    const promises = [];
    for (let i = 0; i < callCount; i++) {
        promises.push(client.call('echo', { index: i, data: `concurrent-${i}` }));
    }

    const results = await Promise.all(promises);

    // All should succeed with correct data
    expect(results.length).toBe(callCount);
    for (let i = 0; i < callCount; i++) {
        expect(results.some(r => r.index === i)).toBe(true);
    }

    await client.disconnect();
};
