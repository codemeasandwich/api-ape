/**
 * Test: undefined survives round-trip
 */
module.exports = async function undefinedSurvivesRoundtrip({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result = await client.call('types', {
    value: undefined,
    explicit: undefined,
    nested: { innerUndef: undefined }
  });

  expect(result.value).toBeUndefined();
  expect(result.explicit).toBeUndefined();
  expect(result.nested.innerUndef).toBeUndefined();
};
