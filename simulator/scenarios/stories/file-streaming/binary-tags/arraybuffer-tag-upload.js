/**
 * Test: array buffer simulation upload
 *
 * Tests that buffer data representing ArrayBuffer content
 * can be transmitted through the standard API.
 */
module.exports = async function arrayBufferTagUpload({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Simulate ArrayBuffer data (represented as Buffer in Node)
  const arrayBufferData = Buffer.alloc(512);
  for (let i = 0; i < arrayBufferData.length; i++) {
    arrayBufferData[i] = 255 - (i % 256);
  }

  const result = await client.call(
    'files/upload',
    {
      name: 'arraybuffer-test.bin',
      data: arrayBufferData,
      broadcast: false
    },
    5000
  );

  expect(result.success).toBe(true);
  expect(result.size).toBe(512);
  expect(result.name).toBe('arraybuffer-test.bin');
};
