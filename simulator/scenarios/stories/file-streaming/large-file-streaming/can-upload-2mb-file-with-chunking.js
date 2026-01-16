/**
 * Test: can upload 2MB file with chunking
 *
 * Tests that files > 1MB can be uploaded successfully.
 * The binary tag system handles chunking automatically.
 */
module.exports = async function canUpload2mbFileWithChunking({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create 2MB buffer with pattern for verification
  const largeData = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }

  const result = await client.call(
    'files/upload',
    {
      name: 'large-file-2mb.bin',
      data: largeData,
      broadcast: false
    },
    30000 // Extended timeout for large file
  );

  expect(result.success).toBe(true);
  expect(result.size).toBe(2 * 1024 * 1024);
  expect(result.hash).toBeDefined();
  expect(result.name).toBe('large-file-2mb.bin');
};
