/**
 * Test: users endpoint returns list
 */
module.exports = async function usersEndpointReturnsList({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result = await client.call('users', {});

  expect(result.users).toBeDefined();
  expect(Array.isArray(result.users)).toBe(true);
  expect(result.total).toBeGreaterThan(0);
};
