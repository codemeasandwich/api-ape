/**
 * Test: upload generates unique hash per file
 */
module.exports = async function uploadGeneratesUniqueHash({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result1 = await client.call('files/upload', {
    name: 'file1.txt',
    data: Buffer.from('Content A'),
    broadcast: false
  });

  const result2 = await client.call('files/upload', {
    name: 'file2.txt',
    data: Buffer.from('Content B'),
    broadcast: false
  });

  expect(result1.hash).toBeDefined();
  expect(result2.hash).toBeDefined();
  expect(result1.hash).not.toBe(result2.hash);
};
