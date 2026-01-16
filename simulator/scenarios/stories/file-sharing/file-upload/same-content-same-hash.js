/**
 * Test: same content produces same hash
 */
module.exports = async function sameContentSameHash({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const content = Buffer.from('Same content');

  const result1 = await client.call('files/upload', {
    name: 'file1.txt',
    data: content,
    broadcast: false
  });

  const result2 = await client.call('files/upload', {
    name: 'file2.txt',
    data: content,
    broadcast: false
  });

  expect(result1.hash).toBe(result2.hash);
};
