/**
 * Test: users endpoint filters by role
 */
module.exports = async function usersEndpointFiltersByRole({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result = await client.call('users', { role: 'admin' });

  expect(result.users.every((u) => u.role === 'admin')).toBe(true);
};
