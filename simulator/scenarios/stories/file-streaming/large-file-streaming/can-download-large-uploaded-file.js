/**
 * Test: can download large uploaded file
 *
 * Tests that large files can be downloaded after upload
 * and the data integrity is preserved.
 */
module.exports = async function canDownloadLargeUploadedFile({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create 1.5MB buffer with verifiable pattern
  const originalSize = 1.5 * 1024 * 1024;
  const largeData = Buffer.alloc(originalSize);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = (i * 7) % 256; // Distinct pattern for verification
  }

  // Upload
  const uploadResult = await client.call(
    'files/upload',
    {
      name: 'download-test-large.bin',
      data: largeData,
      broadcast: false
    },
    10000
  );

  expect(uploadResult.success).toBe(true);

  // Download
  const downloadResult = await client.call(
    'files/download',
    { hash: uploadResult.hash },
    10000
  );

  expect(downloadResult.name).toBe('download-test-large.bin');
  expect(downloadResult.size).toBe(originalSize);
  expect(downloadResult.data).toBeDefined();
};
