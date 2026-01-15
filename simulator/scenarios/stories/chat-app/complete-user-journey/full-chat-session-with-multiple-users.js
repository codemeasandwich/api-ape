/**
 * Test: full chat session with multiple users
 *
 * Simulates a complete chat session where:
 * - Alice joins first
 * - Bob joins second
 * - They exchange messages
 * - Charlie joins late
 * - Bob disconnects
 * - Messages continue between remaining users
 */
module.exports = async function fullChatSessionWithMultipleUsers({ harness, expect }) {
    const connectedUsers = [];

    // Create chat server with user tracking
    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => {
            const userId = `user-${connectedUsers.length + 1}`;
            connectedUsers.push(userId);

            // Send welcome to the new user
            send('welcome', {
                userId,
                onlineUsers: connectedUsers.length
            });

            return {
                embed: { userId }
            };
        }
    });

    // === Alice joins the chat ===
    const alice = await harness.createClientForServer(server);
    const aliceWelcome = await alice.waitFor('welcome', 200);

    expect(aliceWelcome.data.userId).toBe('user-1');
    expect(aliceWelcome.data.onlineUsers).toBe(1);

    // Track Alice's received messages
    const aliceMessages = [];
    alice.on('message', (msg) => aliceMessages.push(msg));

    // === Bob joins the chat ===
    const bob = await harness.createClientForServer(server);
    const bobWelcome = await bob.waitFor('welcome', 200);

    expect(bobWelcome.data.userId).toBe('user-2');
    expect(bobWelcome.data.onlineUsers).toBe(2);

    // Track Bob's received messages
    const bobMessages = [];
    bob.on('message', (msg) => bobMessages.push(msg));

    // === Alice sends a message ===
    const sendResult = await alice.call('message', {
        text: 'Hello Bob!',
        user: 'Alice'
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.messageId).toBeDefined();

    // Wait for broadcast
    await harness.wait(20);

    // Bob should receive, Alice should not
    expect(bobMessages.length).toBe(1);
    expect(bobMessages[0].data.text).toBe('Hello Bob!');
    expect(aliceMessages.length).toBe(0);

    // === Bob replies ===
    await bob.call('message', { text: 'Hi Alice!', user: 'Bob' });
    await harness.wait(20);

    // Alice should now have received Bob's message
    expect(aliceMessages.length).toBe(1);
    expect(aliceMessages[0].data.text).toBe('Hi Alice!');

    // === Charlie joins late ===
    const charlie = await harness.createClientForServer(server);
    const charlieWelcome = await charlie.waitFor('welcome', 200);

    expect(charlieWelcome.data.onlineUsers).toBe(3);

    const charlieMessages = [];
    charlie.on('message', (msg) => charlieMessages.push(msg));

    // Charlie should not have received any of the previous messages
    expect(charlieMessages.length).toBe(0);

    // === Alice sends to everyone ===
    await alice.call('message', { text: 'Welcome Charlie!', user: 'Alice' });
    await harness.wait(20);

    // Both Bob and Charlie receive
    expect(bobMessages.length).toBe(2);
    expect(charlieMessages.length).toBe(1);
    expect(charlieMessages[0].data.text).toBe('Welcome Charlie!');

    // Server should track all 3 clients
    expect(server.clientCount).toBe(3);

    // === Bob disconnects ===
    await bob.disconnect();
    await harness.wait(20);

    expect(server.clientCount).toBe(2);

    // === Alice sends after Bob left ===
    await alice.call('message', { text: 'Bob left', user: 'Alice' });
    await harness.wait(20);

    // Charlie receives, Bob doesn't (disconnected)
    expect(charlieMessages.length).toBe(2);
    expect(charlieMessages[1].data.text).toBe('Bob left');

    // Bob's message count should still be 2 (no new messages)
    expect(bobMessages.length).toBe(2);
};
