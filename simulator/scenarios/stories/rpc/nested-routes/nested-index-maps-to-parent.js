/**
 * Test: nested directory index.js maps to parent path
 */
module.exports = async function nestedIndexMapsToParent({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // nested/index.js should map to api.nested()
  const result = await client.call('nested', { test: true });

  expect(result.type).toBe('index');
  expect(result.path).toBe('nested');
  expect(result.data.test).toBe(true);
};
