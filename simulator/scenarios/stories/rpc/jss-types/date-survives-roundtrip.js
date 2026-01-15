/**
 * Test: Date survives round-trip
 */
module.exports = async function dateSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });
  const testDate = new Date('2024-01-15T12:30:00Z');

  const result = await client.call('types', { date: testDate });

  expect(result.date).toBeInstanceOf(Date);
  expect(result.date.getTime()).toBe(testDate.getTime());
  expect(result.serverTimestamp).toBeInstanceOf(Date);
};
