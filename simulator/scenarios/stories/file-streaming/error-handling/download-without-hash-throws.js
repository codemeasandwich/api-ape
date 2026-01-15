/**
 * Test: download without hash throws
 *
 * Tests that attempting to download without providing a hash
 * results in an appropriate error.
 */
module.exports = async function downloadWithoutHashThrows({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('files/download', {
      // Missing 'hash' field
    }, 3000)
  ).rejects.toThrow();
};
