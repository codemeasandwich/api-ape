/**
 * User makes same request twice (idempotency)
 */
module.exports = async function repeatedRequestsWithDifferentDataWork({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Different data each time to avoid replay protection
    const results = await Promise.all([
        client.call('echo', { id: 1, ts: Date.now() }),
        client.call('echo', { id: 2, ts: Date.now() + 1 }),
        client.call('echo', { id: 3, ts: Date.now() + 2 })
    ]);

    expect(results.length).toBe(3);
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
    expect(results[2].id).toBe(3);

    await client.disconnect();
};
