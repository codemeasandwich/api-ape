/**
 * Test: 3-level deep route resolves correctly
 */
module.exports = async function threeLevelDeepRoute({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // nested/deep/handler.js → api.nested.deep.handler()
  const result = await client.call('nested/deep/handler', { message: 'Test' });

  expect(result.depth).toBe(3);
  expect(result.path).toBe('nested/deep/handler');
  expect(result.message).toBe('Test');
};
