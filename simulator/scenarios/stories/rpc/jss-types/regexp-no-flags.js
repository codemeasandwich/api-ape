/**
 * Test: RegExp without flags survives round-trip
 */
module.exports = async function regexpNoFlags({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testRegex = /simple-pattern/;

  const result = await client.call('types', { regex: testRegex });

  expect(result.regex).toBeInstanceOf(RegExp);
  expect(result.regex.source).toBe('simple-pattern');
  expect(result.regex.flags).toBe('');
};
