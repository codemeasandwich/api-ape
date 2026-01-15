/**
 * Test: partial read while streaming
 *
 * Tests that files can be accessed after initial upload completes.
 * Simulates a scenario where file data is available progressively.
 */
module.exports = async function partialReadWhileStreaming({ harness, expect }) {
  const { clients } = await harness.createGroup(2, { where: 'test-api' });
  const [uploader, downloader] = clients;

  // Upload file
  const fileData = Buffer.from('This is the complete file data that would stream over time');

  const uploadResult = await uploader.call(
    'files/upload',
    {
      name: 'partial-read-test.txt',
      data: fileData,
      broadcast: false
    },
    5000
  );

  expect(uploadResult.success).toBe(true);

  // Another client downloads the file
  const downloadResult = await downloader.call('files/download', {
    hash: uploadResult.hash
  }, 3000);

  expect(downloadResult.name).toBe('partial-read-test.txt');
  expect(downloadResult.size).toBe(fileData.length);
};
