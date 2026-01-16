/**
 * Test: multiple async calls complete independently
 */
module.exports = async function multipleAsyncCallsIndependent({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Start all calls simultaneously
  const promises = [
    client.call('delay', { ms: 30, id: 1 }),
    client.call('delay', { ms: 20, id: 2 }),
    client.call('delay', { ms: 10, id: 3 })
  ];

  const results = await Promise.all(promises);

  // All should complete
  expect(results).toHaveLength(3);
  expect(results.map((r) => r.id).sort()).toEqual([1, 2, 3]);
};
