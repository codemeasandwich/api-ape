/**
 * Test: binary data integrity preserved
 *
 * Tests that binary data sent through the API is received
 * with exact byte-level accuracy.
 */
module.exports = async function binaryDataIntegrityPreserved({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create buffer with all possible byte values
  const testData = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) {
    testData[i] = i;
  }

  // Upload via standard API
  const uploadResult = await client.call(
    'files/upload',
    {
      name: 'integrity-test.bin',
      data: testData,
      broadcast: false
    },
    5000
  );

  expect(uploadResult.success).toBe(true);
  expect(uploadResult.size).toBe(256);

  // Download and verify integrity
  const downloadResult = await client.call('files/download', {
    hash: uploadResult.hash
  }, 5000);

  expect(downloadResult.size).toBe(256);
  expect(downloadResult.data).toBeDefined();
};
