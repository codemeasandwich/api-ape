/**
 * Test: complex nested types survive round-trip
 */
module.exports = async function complexNestedTypes({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const complexData = {
    date: new Date(),
    regex: /hello/i,
    set: new Set(['a', 'b']),
    map: new Map([['key', 'value']]),
    nested: {
      innerDate: new Date('2023-06-15'),
      innerSet: new Set([10, 20])
    }
  };

  const result = await client.call('types', complexData);

  expect(result.date).toBeInstanceOf(Date);
  expect(result.regex).toBeInstanceOf(RegExp);
  expect(result.set).toBeInstanceOf(Set);
  expect(result.map).toBeInstanceOf(Map);
  expect(result.nested.innerDate).toBeInstanceOf(Date);
  expect(result.nested.innerSet).toBeInstanceOf(Set);
};
