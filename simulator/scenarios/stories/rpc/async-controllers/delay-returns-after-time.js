/**
 * Test: delay controller returns after specified time
 */
module.exports = async function delayReturnsAfterTime({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const start = Date.now();
  const result = await client.call('delay', { ms: 50 });
  const elapsed = Date.now() - start;

  expect(result.delayed).toBe(true);
  expect(result.ms).toBe(50);
  expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
};
