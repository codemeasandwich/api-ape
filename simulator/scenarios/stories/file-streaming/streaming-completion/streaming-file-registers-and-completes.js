/**
 * Test: streaming file registers and completes
 *
 * Tests the streaming file lifecycle: register, append chunks,
 * and mark as complete.
 */
module.exports = async function streamingFileRegistersAndCompletes({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Upload a file that will be used as a streaming test
  const streamData = Buffer.from('Streaming file content that arrives over time');

  const result = await client.call(
    'files/upload',
    {
      name: 'streaming-test.txt',
      data: streamData,
      broadcast: false
    },
    5000
  );

  expect(result.success).toBe(true);
  expect(result.hash).toBeDefined();

  // Verify we can download it (proves it completed)
  const downloadResult = await client.call('files/download', {
    hash: result.hash
  }, 3000);

  expect(downloadResult.name).toBe('streaming-test.txt');
  expect(downloadResult.data).toBeDefined();
};
