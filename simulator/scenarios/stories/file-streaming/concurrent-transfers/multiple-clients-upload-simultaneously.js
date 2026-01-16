/**
 * Test: multiple clients upload simultaneously
 *
 * Tests that multiple clients can upload files at the same time
 * without interfering with each other.
 */
module.exports = async function multipleClientsUploadSimultaneously({ harness, expect }) {
  const { clients } = await harness.createGroup(3, { where: 'test-api' });
  const [alice, bob, charlie] = clients;

  // Create unique data for each client
  const aliceData = Buffer.alloc(50 * 1024, 'A'.charCodeAt(0));
  const bobData = Buffer.alloc(75 * 1024, 'B'.charCodeAt(0));
  const charlieData = Buffer.alloc(100 * 1024, 'C'.charCodeAt(0));

  // Upload simultaneously
  const [aliceResult, bobResult, charlieResult] = await Promise.all([
    alice.call('files/upload', {
      name: 'alice-file.bin',
      data: aliceData,
      broadcast: false
    }, 5000),
    bob.call('files/upload', {
      name: 'bob-file.bin',
      data: bobData,
      broadcast: false
    }, 5000),
    charlie.call('files/upload', {
      name: 'charlie-file.bin',
      data: charlieData,
      broadcast: false
    }, 5000)
  ]);

  // Verify all uploads succeeded
  expect(aliceResult.success).toBe(true);
  expect(aliceResult.size).toBe(50 * 1024);
  expect(aliceResult.name).toBe('alice-file.bin');

  expect(bobResult.success).toBe(true);
  expect(bobResult.size).toBe(75 * 1024);
  expect(bobResult.name).toBe('bob-file.bin');

  expect(charlieResult.success).toBe(true);
  expect(charlieResult.size).toBe(100 * 1024);
  expect(charlieResult.name).toBe('charlie-file.bin');

  // Verify hashes are unique
  expect(aliceResult.hash).not.toBe(bobResult.hash);
  expect(bobResult.hash).not.toBe(charlieResult.hash);
  expect(aliceResult.hash).not.toBe(charlieResult.hash);
};
