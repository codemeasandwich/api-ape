/**
 * Test: upload without data throws
 *
 * Tests that attempting to upload without providing file data
 * results in an appropriate error.
 */
module.exports = async function uploadWithoutDataThrows({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('files/upload', {
      name: 'no-data.txt',
      broadcast: false
      // Missing 'data' field
    }, 3000)
  ).rejects.toThrow();
};
