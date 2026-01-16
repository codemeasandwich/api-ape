/**
 * Test: embedded values available in controller context
 */
module.exports = async function embeddedValuesAvailableInControllerContext({ harness, expect }) {
    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => ({
            embed: { userId: 'user-123', role: 'admin' }
        })
    });

    const client = await harness.createClientForServer(server);

    // Call profile which returns this.userId and this.role
    const result = await client.call('users/profile', { id: 1 });

    expect(result.userId).toBe('user-123');
    expect(result.role).toBe('admin');
};
