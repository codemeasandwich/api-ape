/**
 * Test: can upload 1MB file
 */
module.exports = async function canUpload1mbFile({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create 1MB buffer
  const largeData = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }

  const result = await client.call(
    'files/upload',
    {
      name: 'large-file.bin',
      data: largeData,
      broadcast: false
    },
    5000
  ); // Extended timeout

  expect(result.success).toBe(true);
  expect(result.size).toBe(1024 * 1024);
};
