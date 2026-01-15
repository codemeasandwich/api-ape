/**
 * Test: concurrent download failure isolated
 *
 * Tests that a failed download request doesn't affect
 * other concurrent download operations.
 */
module.exports = async function concurrentDownloadFailureIsolated({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Upload a valid file first
  const validData = Buffer.from('Valid file content');
  const uploadResult = await client.call('files/upload', {
    name: 'valid-file.txt',
    data: validData,
    broadcast: false
  }, 3000);

  expect(uploadResult.success).toBe(true);

  // Attempt concurrent downloads: one valid, one invalid
  const validDownload = client.call('files/download', {
    hash: uploadResult.hash
  }, 3000);

  const invalidDownload = client.call('files/download', {
    hash: 'invalid-nonexistent-hash'
  }, 3000);

  // Wait for results
  const results = await Promise.allSettled([validDownload, invalidDownload]);

  // Valid download should succeed
  expect(results[0].status).toBe('fulfilled');
  expect(results[0].value.name).toBe('valid-file.txt');

  // Invalid download should fail
  expect(results[1].status).toBe('rejected');
};
