/**
 * Test: can upload a binary file
 */
module.exports = async function canUploadBinaryFile({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const testData = Buffer.from('Hello, World!');

  const result = await client.call('files/upload', {
    name: 'test.txt',
    data: testData,
    broadcast: false
  });

  expect(result.success).toBe(true);
  expect(result.hash).toBeDefined();
  expect(result.name).toBe('test.txt');
  expect(result.size).toBe(testData.length);
};
