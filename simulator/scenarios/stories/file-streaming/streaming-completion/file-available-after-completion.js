/**
 * Test: file available after completion
 *
 * Tests that a completed file remains available for download
 * until cleanup timeout.
 */
module.exports = async function fileAvailableAfterCompletion({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const fileData = Buffer.from('Completed file content');

  const uploadResult = await client.call(
    'files/upload',
    {
      name: 'completion-test.txt',
      data: fileData,
      broadcast: false
    },
    3000
  );

  expect(uploadResult.success).toBe(true);

  // Wait a bit to simulate time passing
  await harness.wait(100);

  // File should still be available
  const download1 = await client.call('files/download', {
    hash: uploadResult.hash
  }, 3000);

  expect(download1.name).toBe('completion-test.txt');

  // Wait again and download with slightly different request to avoid duplicate detection
  await harness.wait(50);

  // Download again to verify persistence (use different random field to generate unique queryId)
  const download2 = await client.call('files/download', {
    hash: uploadResult.hash,
    _ts: Date.now() // Add timestamp to make request unique
  }, 3000);

  expect(download2.name).toBe('completion-test.txt');
  expect(download2.size).toBe(fileData.length);
};
