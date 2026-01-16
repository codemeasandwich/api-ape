/**
 * Test: each client can have different embed values
 */
module.exports = async function eachClientCanHaveDifferentEmbedValues({ harness, expect }) {
    let connectionCount = 0;

    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => {
            connectionCount++;
            return {
                embed: {
                    userId: `user-${connectionCount}`,
                    connectionNumber: connectionCount
                }
            };
        }
    });

    const client1 = await harness.createClientForServer(server);
    const client2 = await harness.createClientForServer(server);

    const profile1 = await client1.call('users/profile', {});
    const profile2 = await client2.call('users/profile', {});

    expect(profile1.userId).toBe('user-1');
    expect(profile2.userId).toBe('user-2');
};
