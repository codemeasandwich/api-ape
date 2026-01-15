/**
 * onConnect hook provides user context
 */
module.exports = async function serverPassesUserContextToControllers({ harness, expect }) {
    let connectionId = 0;
    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => ({
            embed: {
                userId: `user-${++connectionId}`,
                role: connectionId === 1 ? 'admin' : 'user'
            }
        })
    });

    const admin = await harness.createClientForServer(server);
    const user = await harness.createClientForServer(server);

    const adminProfile = await admin.call('users/profile', {});
    const userProfile = await user.call('users/profile', {});

    expect(adminProfile.userId).toBe('user-1');
    expect(adminProfile.role).toBe('admin');
    expect(userProfile.userId).toBe('user-2');
    expect(userProfile.role).toBe('user');

    await admin.disconnect();
    await user.disconnect();
};
