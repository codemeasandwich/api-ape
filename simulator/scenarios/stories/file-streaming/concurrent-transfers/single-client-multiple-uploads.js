/**
 * Test: single client multiple uploads
 *
 * Tests that a single client can upload multiple files
 * concurrently without issues.
 */
module.exports = async function singleClientMultipleUploads({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  // Create multiple distinct files
  const files = [
    { name: 'file1.txt', data: Buffer.from('Content of file 1') },
    { name: 'file2.txt', data: Buffer.from('Content of file 2 with more data') },
    { name: 'file3.bin', data: Buffer.alloc(10 * 1024, 0x42) },
    { name: 'file4.json', data: Buffer.from('{"key": "value"}') },
    { name: 'file5.dat', data: Buffer.alloc(20 * 1024, 0xFF) }
  ];

  // Upload all files simultaneously
  const results = await Promise.all(
    files.map(file =>
      client.call('files/upload', {
        name: file.name,
        data: file.data,
        broadcast: false
      }, 3000)
    )
  );

  // Verify all uploads succeeded
  for (let i = 0; i < files.length; i++) {
    expect(results[i].success).toBe(true);
    expect(results[i].name).toBe(files[i].name);
    expect(results[i].size).toBe(files[i].data.length);
    expect(results[i].hash).toBeDefined();
  }

  // Verify all hashes are unique (different content = different hash)
  const hashes = results.map(r => r.hash);
  const uniqueHashes = new Set(hashes);
  expect(uniqueHashes.size).toBe(files.length);
};
