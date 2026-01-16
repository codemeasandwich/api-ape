/**
 * Test: empty file upload throws
 *
 * Tests that attempting to upload a null or undefined data field
 * results in an error.
 */
module.exports = async function emptyFileUploadThrows({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  await expect(
    client.call('files/upload', {
      name: 'empty.txt',
      data: null,
      broadcast: false
    }, 3000)
  ).rejects.toThrow();
};
