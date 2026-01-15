/**
 * User makes multiple slow calls in parallel
 */
module.exports = async function parallelSlowCallsCompleteIndependently({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Start multiple delayed calls
    const start = Date.now();
    const [result1, result2, result3] = await Promise.all([
        client.call('delay', { ms: 50, id: 1 }),
        client.call('delay', { ms: 30, id: 2 }),
        client.call('delay', { ms: 40, id: 3 })
    ]);
    const elapsed = Date.now() - start;

    // Should complete in parallel (~50ms total, not 120ms)
    expect(elapsed).toBeLessThan(100);
    expect(result1.id).toBe(1);
    expect(result2.id).toBe(2);
    expect(result3.id).toBe(3);

    await client.disconnect();
};
