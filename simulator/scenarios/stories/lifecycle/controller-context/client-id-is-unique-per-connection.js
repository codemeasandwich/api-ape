/**
 * Test: this.clientId is unique per connection
 */
module.exports = async function clientIdIsUniquePerConnection({ harness, expect }) {
    const { server, clients } = await harness.createGroup(3, {
        where: 'test-api'
    });

    const clientIds = await Promise.all(
        clients.map((c) => c.call('users/profile', {}))
    );

    const ids = clientIds.map((p) => p.clientId);

    // All IDs should be defined
    expect(ids.every((id) => id)).toBe(true);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(3);
};
