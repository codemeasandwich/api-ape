/**
 * Test: download invalid hash throws
 *
 * Tests that attempting to download with an invalid or
 * non-existent hash results in an error.
 */
module.exports = async function downloadInvalidHashThrows({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('files/download', {
      hash: 'invalid-hash-that-does-not-exist'
    }, 3000)
  ).rejects.toThrow(/not found/i);
};
