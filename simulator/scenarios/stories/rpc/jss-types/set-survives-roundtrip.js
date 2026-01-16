/**
 * Test: Set survives round-trip
 */
module.exports = async function setSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testSet = new Set([1, 2, 3, 4, 5]);

  const result = await client.call('types', { set: testSet });

  expect(result.set).toBeInstanceOf(Set);
  expect(result.set.size).toBe(5);
  expect([...result.set]).toEqual([1, 2, 3, 4, 5]);
};
