/**
 * Test: 4-level deep route resolves correctly
 */
module.exports = async function fourLevelDeepRoute({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // nested/deep/very/handler.js → api.nested.deep.very.handler()
  const result = await client.call('nested/deep/very/handler', { message: 'Very deep' });

  expect(result.depth).toBe(4);
  expect(result.path).toBe('nested/deep/very/handler');
  expect(result.message).toBe('Very deep');
};
