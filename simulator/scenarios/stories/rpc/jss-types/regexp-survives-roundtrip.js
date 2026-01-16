/**
 * Test: RegExp survives round-trip
 */
module.exports = async function regexpSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testRegex = /test-\d+/gi;

  const result = await client.call('types', { regex: testRegex });

  expect(result.regex).toBeInstanceOf(RegExp);
  expect(result.regex.source).toBe(testRegex.source);
  expect(result.regex.flags).toBe(testRegex.flags);
};
