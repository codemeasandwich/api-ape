/**
 * Test: multiple binary uploads in sequence
 *
 * Tests that multiple binary files can be uploaded in rapid
 * succession without interference.
 */
module.exports = async function multipleBinaryFieldsInOneMessage({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const file1Data = Buffer.from('First file content');
  const file2Data = Buffer.from('Second file content - longer');
  const file3Data = Buffer.alloc(256, 0x42);

  // Upload files in parallel
  const results = await Promise.all([
    client.call(
      'files/upload',
      { name: 'multi-1.txt', data: file1Data, broadcast: false },
      3000
    ),
    client.call(
      'files/upload',
      { name: 'multi-2.txt', data: file2Data, broadcast: false },
      3000
    ),
    client.call(
      'files/upload',
      { name: 'multi-3.bin', data: file3Data, broadcast: false },
      3000
    )
  ]);

  expect(results[0].success).toBe(true);
  expect(results[0].size).toBe(file1Data.length);

  expect(results[1].success).toBe(true);
  expect(results[1].size).toBe(file2Data.length);

  expect(results[2].success).toBe(true);
  expect(results[2].size).toBe(256);
};
