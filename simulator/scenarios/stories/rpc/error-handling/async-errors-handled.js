/**
 * Test: async errors are handled correctly
 */
module.exports = async function asyncErrorsHandled({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('errors', { type: 'async', message: 'Delayed error' })
  ).rejects.toThrow('Async error');
};
