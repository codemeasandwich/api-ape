/**
 * Test: TypeError survives round-trip
 */
module.exports = async function typeErrorSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testError = new TypeError('Invalid type');

  const result = await client.call('types', { error: testError });

  expect(result.error).toBeInstanceOf(TypeError);
  expect(result.error.message).toBe('Invalid type');
};
