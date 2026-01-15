/**
 * Test: download non-existent file throws error
 */
module.exports = async function downloadNonexistentThrows({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('files/download', { hash: 'nonexistent-hash' })
  ).rejects.toThrow('not found');
};
