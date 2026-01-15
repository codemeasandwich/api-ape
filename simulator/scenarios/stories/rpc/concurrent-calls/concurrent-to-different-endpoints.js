/**
 * Test: concurrent calls to different endpoints
 */
module.exports = async function concurrentToDifferentEndpoints({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const [echoResult, usersResult, profileResult] = await Promise.all([
    client.call('echo', { test: true }),
    client.call('users', {}),
    client.call('users/profile', { id: 1 })
  ]);

  expect(echoResult.test).toBe(true);
  expect(usersResult.users).toBeDefined();
  expect(profileResult.profile).toBeDefined();
};
