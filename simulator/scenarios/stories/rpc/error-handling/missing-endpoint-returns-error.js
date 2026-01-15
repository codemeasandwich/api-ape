/**
 * Test: missing endpoint returns error
 */
module.exports = async function missingEndpointReturnsError({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(client.call('nonexistent', {})).rejects.toThrow();
};
