/**
 * Test: upload broadcasts file-shared to other clients
 */
module.exports = async function uploadBroadcastsToOthers({ harness, expect }) {
  const { clients } = await harness.createGroup(3, { where: 'test-api' });
  const [alice, bob, charlie] = clients;

  const bobNotifications = [];
  const charlieNotifications = [];
  const aliceNotifications = [];

  alice.on('file-shared', (msg) => aliceNotifications.push(msg));
  bob.on('file-shared', (msg) => bobNotifications.push(msg));
  charlie.on('file-shared', (msg) => charlieNotifications.push(msg));

  // Alice uploads a file (broadcasts to others by default)
  const result = await alice.call('files/upload', {
    name: 'shared-file.txt',
    data: Buffer.from('Shared content')
  });

  await harness.wait(50);

  // Alice should not receive (broadcastOthers)
  expect(aliceNotifications.length).toBe(0);

  // Bob and Charlie should receive
  expect(bobNotifications.length).toBe(1);
  expect(charlieNotifications.length).toBe(1);

  expect(bobNotifications[0].data.name).toBe('shared-file.txt');
  expect(bobNotifications[0].data.hash).toBe(result.hash);
};
