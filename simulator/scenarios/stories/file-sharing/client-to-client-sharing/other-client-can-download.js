/**
 * Test: other client can download shared file
 */
module.exports = async function otherClientCanDownload({ harness, expect }) {
  const { clients } = await harness.createGroup(2, { where: 'test-api' });
  const [alice, bob] = clients;

  // Alice uploads
  const uploadResult = await alice.call('files/upload', {
    name: 'for-bob.txt',
    data: Buffer.from('Content for Bob'),
    broadcast: false
  });

  // Bob downloads using the hash
  const downloadResult = await bob.call('files/download', {
    hash: uploadResult.hash
  });

  expect(downloadResult.name).toBe('for-bob.txt');
  expect(downloadResult.size).toBe(15); // 'Content for Bob'.length
};
