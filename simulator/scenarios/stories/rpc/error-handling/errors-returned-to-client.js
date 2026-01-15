/**
 * Test: errors are properly returned to client
 */
module.exports = async function errorsReturnedToClient({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('errors', { type: 'generic', message: 'Test error' })
  ).rejects.toThrow('Test error');
};
