/**
 * Test: multiple sequential calls work correctly
 */
module.exports = async function multipleSequentialCalls({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const results = [];
  for (let i = 0; i < 5; i++) {
    const result = await client.call('echo', { index: i });
    results.push(result);
  }

  expect(results).toHaveLength(5);
  results.forEach((r, i) => {
    expect(r.index).toBe(i);
  });
};
