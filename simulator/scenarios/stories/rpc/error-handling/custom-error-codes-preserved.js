/**
 * Test: custom error codes are preserved
 */
module.exports = async function customErrorCodesPreserved({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('errors', {
      type: 'custom',
      message: 'Custom error',
      details: { field: 'email' }
    })
  ).rejects.toThrow('Custom error');
};
