/**
 * Test: buffer tag upload
 *
 * Tests that Buffer data can be sent through the standard upload API.
 * The server handles binary data encoding/decoding via JSS.
 */
module.exports = async function bufferTagUpload({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create buffer with distinct pattern
  const binaryData = Buffer.alloc(1024);
  for (let i = 0; i < binaryData.length; i++) {
    binaryData[i] = i % 256;
  }

  // Standard upload - JSS handles buffer serialization
  const result = await client.call(
    'files/upload',
    {
      name: 'buffer-tag-test.bin',
      data: binaryData,
      broadcast: false
    },
    5000
  );

  expect(result.success).toBe(true);
  expect(result.size).toBe(1024);
  expect(result.name).toBe('buffer-tag-test.bin');
  expect(result.hash).toBeDefined();
};
