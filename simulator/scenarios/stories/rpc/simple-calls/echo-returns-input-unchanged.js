/**
 * Test: echo returns input data unchanged
 */
module.exports = async function echoReturnsInputUnchanged({ harness, expect }) {
  const { client } = await harness.createPair({ where: 'test-api' });

  const result = await client.call('echo', {
    message: 'Hello!',
    number: 42,
    nested: { a: 1, b: 2 }
  });

  expect(result.message).toBe('Hello!');
  expect(result.number).toBe(42);
  expect(result.nested.a).toBe(1);
};
