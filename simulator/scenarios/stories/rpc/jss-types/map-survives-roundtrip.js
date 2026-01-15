/**
 * Test: Map survives round-trip
 */
module.exports = async function mapSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testMap = new Map([
    ['a', 1],
    ['b', 2]
  ]);

  const result = await client.call('types', { map: testMap });

  expect(result.map).toBeInstanceOf(Map);
  expect(result.map.get('a')).toBe(1);
  expect(result.map.get('b')).toBe(2);
};
