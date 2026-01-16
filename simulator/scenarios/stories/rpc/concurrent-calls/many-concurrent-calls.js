/**
 * Test: many concurrent calls all complete correctly
 */
module.exports = async function manyConcurrentCalls({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const count = 20;
  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(client.call('echo', { index: i, data: `call-${i}` }));
  }

  const results = await Promise.all(promises);

  expect(results).toHaveLength(count);
  results.forEach((r, i) => {
    expect(r.index).toBe(i);
    expect(r.data).toBe(`call-${i}`);
  });
};
