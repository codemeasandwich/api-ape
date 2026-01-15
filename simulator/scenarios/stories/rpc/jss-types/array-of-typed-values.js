/**
 * Test: array of typed values survives round-trip
 */
module.exports = async function arrayOfTypedValues({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testData = {
    dates: [
      new Date('2024-01-01'),
      new Date('2024-02-01'),
      new Date('2024-03-01')
    ],
    mixed: [
      new Date(),
      new Set([1, 2]),
      new Map([['a', 1]])
    ]
  };

  const result = await client.call('types', testData);

  expect(result.dates).toHaveLength(3);
  expect(result.dates[0]).toBeInstanceOf(Date);
  expect(result.dates[1]).toBeInstanceOf(Date);
  expect(result.dates[2]).toBeInstanceOf(Date);

  expect(result.mixed[0]).toBeInstanceOf(Date);
  expect(result.mixed[1]).toBeInstanceOf(Set);
  expect(result.mixed[2]).toBeInstanceOf(Map);
};
