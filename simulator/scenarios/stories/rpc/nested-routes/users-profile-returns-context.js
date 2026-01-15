/**
 * Test: users/profile returns profile with context
 */
module.exports = async function usersProfileReturnsContext({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result = await client.call('users/profile', { id: 123 });

  expect(result.requestedId).toBe(123);
  expect(result.clientId).toBeDefined();
  expect(result.profile).toBeDefined();
  expect(result.profile.id).toBe(123);
};
