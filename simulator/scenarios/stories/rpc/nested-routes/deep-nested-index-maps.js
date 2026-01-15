/**
 * Test: deep nested index.js maps correctly
 */
module.exports = async function deepNestedIndexMaps({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // nested/deep/index.js should map to api.nested.deep()
  const result = await client.call('nested/deep', { depth: 2 });

  expect(result.type).toBe('index');
  expect(result.depth).toBe(2);
  expect(result.path).toBe('nested/deep');
};
