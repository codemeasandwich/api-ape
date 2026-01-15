/**
 * Test: Error survives round-trip
 */
module.exports = async function errorSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testError = new Error('Test error message');

  const result = await client.call('types', { error: testError });

  expect(result.error).toBeInstanceOf(Error);
  expect(result.error.message).toBe('Test error message');
};
