/**
 * Test: this.clientId accessible in users controller
 */
module.exports = async function clientIdAccessibleInUsersController({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    const result = await client.call('users', {});

    expect(result.requestedBy).toBeDefined();
    expect(typeof result.requestedBy).toBe('string');
};
