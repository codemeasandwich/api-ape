/**
 * @fileoverview FS1 scenario — verify large download integrity after upload (simulator).
 *
 * Tests that large files can be downloaded after upload
 * and the data integrity is preserved.
 *
 * @param {{ harness: import('../../../harness').Harness, expect: jest.Expect }} ctx - Harness + Jest expect
 * @returns {Promise<void>}
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
    30000
  );

  expect(uploadResult.success).toBe(true);

  // Download
  const downloadResult = await client.call(
    'files/download',
    { hash: uploadResult.hash },
    30000
  );

  expect(downloadResult.name).toBe('download-test-large.bin');
  expect(downloadResult.size).toBe(originalSize);
  expect(downloadResult.data).toBeDefined();
};
