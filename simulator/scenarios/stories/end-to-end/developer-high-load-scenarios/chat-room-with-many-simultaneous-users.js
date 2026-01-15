/**
 * Many users join and interact simultaneously
 */
module.exports = async function chatRoomWithManySimultaneousUsers({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    // Create 10 users
    const users = [];
    for (let i = 0; i < 10; i++) {
        const user = await harness.createClientForServer(server);
        users.push({ client: user, messages: [] });
        user.on('message', (msg) => users[i].messages.push(msg));
    }

    expect(server.clientCount).toBe(10);

    // First user sends a message - everyone else should get it
    await users[0].client.call('message', { text: 'Hello everyone!' });
    await harness.wait(50);

    // 9 other users should receive
    for (let i = 1; i < 10; i++) {
        expect(users[i].messages.length).toBe(1);
    }
    // Sender should NOT receive their own message
    expect(users[0].messages.length).toBe(0);

    // Cleanup
    for (const user of users) {
        await user.client.disconnect();
    }
};
