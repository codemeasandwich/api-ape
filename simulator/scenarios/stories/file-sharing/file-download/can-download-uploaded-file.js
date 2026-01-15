/**
 * Test: can download uploaded file
 */
module.exports = async function canDownloadUploadedFile({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const originalContent = 'Test file content for download';
  const testData = Buffer.from(originalContent);

  // Upload first
  const uploadResult = await client.call('files/upload', {
    name: 'download-test.txt',
    data: testData,
    broadcast: false
  });

  // Then download
  const downloadResult = await client.call('files/download', {
    hash: uploadResult.hash
  });

  expect(downloadResult.name).toBe('download-test.txt');
  expect(downloadResult.size).toBe(testData.length);
  expect(downloadResult.data).toBeDefined();
};
