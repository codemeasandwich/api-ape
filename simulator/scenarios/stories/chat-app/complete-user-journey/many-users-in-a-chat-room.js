/**
 * Test: many users in a chat room
 *
 * Tests a chat room with multiple users (8), ensuring that when each user
 * sends a message, all other users receive it (but not the sender).
 */
module.exports = async function manyUsersInAChatRoom({ harness, expect }) {
    const userCount = 8;

    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => {
            send('joined', { timestamp: Date.now() });
            return { embed: {} };
        }
    });

    // Create all users
    const users = [];
    for (let i = 0; i < userCount; i++) {
        const user = await harness.createClientForServer(server);
        await user.waitFor('joined', 200);
        users.push(user);
    }

    expect(server.clientCount).toBe(userCount);

    // Track messages for each user
    const messageCounts = users.map(() => ({ count: 0 }));
    users.forEach((user, i) => {
        user.on('message', () => {
            messageCounts[i].count++;
        });
    });

    // Each user sends one message
    for (let i = 0; i < userCount; i++) {
        await users[i].call('message', { text: `Hello from user ${i}` });
    }

    await harness.wait(100);

    // Each user should receive (userCount - 1) messages
    // (everyone's message except their own)
    for (let i = 0; i < userCount; i++) {
        expect(messageCounts[i].count).toBe(userCount - 1);
    }
};
