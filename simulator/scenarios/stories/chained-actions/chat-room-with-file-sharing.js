/**
 * End-to-End: Chat room with file sharing
 *
 * This test chains action functions together to test a complete flow:
 * 1. Create server with lifecycle hooks (embed user info)
 * 2. Connect multiple users
 * 3. Users exchange chat messages via broadcast
 * 4. One user shares a file
 * 5. Other users receive notification and download file
 * 6. Users disconnect
 *
 * Uses actions from: connection, rpc, broadcast, files, lifecycle
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const broadcast = require('../../actions/broadcast');
const files = require('../../actions/files');
const lifecycle = require('../../actions/lifecycle');

module.exports = async function chatRoomWithFileSharing({ harness, expect }) {
    let connectionCount = 0;

    // === STEP 1: Create server with user tracking ===
    const { server, events } = await lifecycle.createServerWithEmbed({
        harness,
        where: 'test-api',
        embed: (socket, req, send) => {
            connectionCount++;
            const userId = `user-${connectionCount}`;
            const role = connectionCount === 1 ? 'host' : 'guest';

            // Send welcome message
            send('welcome', { userId, role });

            return { userId, role };
        }
    });

    // === STEP 2: Connect Alice (host) ===
    const alice = await connection.connect({ harness, server });
    const aliceWelcome = await alice.waitFor('welcome', 200);
    expect(aliceWelcome.data.userId).toBe('user-1');
    expect(aliceWelcome.data.role).toBe('host');

    // Set up Alice's message listeners (returns array to track)
    const aliceMessages = broadcast.listen({ client: alice, type: 'message' });
    const aliceFileNotifs = broadcast.listen({ client: alice, type: 'file-shared' });

    // === STEP 3: Connect Bob (guest) ===
    const bob = await connection.connect({ harness, server });
    const bobWelcome = await bob.waitFor('welcome', 200);
    expect(bobWelcome.data.userId).toBe('user-2');
    expect(bobWelcome.data.role).toBe('guest');

    // Set up Bob's message listeners
    const bobMessages = broadcast.listen({ client: bob, type: 'message' });
    const bobFileNotifs = broadcast.listen({ client: bob, type: 'file-shared' });

    // Verify connection count
    expect(connection.getClientCount({ server })).toBe(2);

    // === STEP 4: Alice sends a chat message ===
    await rpc.callAndExpect({
        client: alice,
        endpoint: 'message',
        data: { text: 'Hello everyone!', user: 'Alice' },
        expect: { success: true }
    });

    // Bob receives, Alice doesn't (broadcast to others)
    expect(bobMessages.length).toBe(1);
    expect(bobMessages[0].data.text).toBe('Hello everyone!');
    expect(aliceMessages.length).toBe(0);

    // === STEP 5: Bob replies ===
    await rpc.call({
        client: bob,
        endpoint: 'message',
        data: { text: 'Hi Alice!', user: 'Bob' }
    });

    // Alice receives Bob's message
    expect(aliceMessages.length).toBe(1);
    expect(aliceMessages[0].data.text).toBe('Hi Alice!');

    // === STEP 6: Alice uploads a file ===
    const testFileData = files.createTestData({ sizeBytes: 1024 });
    const uploadResult = await files.upload({
        client: alice,
        endpoint: 'files/upload',
        filename: 'document.txt',
        data: testFileData,
        metadata: { broadcast: true }
    });
    expect(uploadResult.success).toBe(true);
    expect(uploadResult.hash).toBeDefined();

    // === STEP 7: Bob receives file notification ===
    expect(bobFileNotifs.length).toBe(1);
    // Alice doesn't receive her own notification
    expect(aliceFileNotifs.length).toBe(0);

    // === STEP 8: Bob downloads the file ===
    const downloadResult = await files.download({
        client: bob,
        endpoint: 'files/download',
        params: { hash: uploadResult.hash }
    });
    expect(downloadResult.name).toBe('document.txt');
    expect(downloadResult.size).toBe(testFileData.length);

    // === STEP 9: Connect Charlie (late joiner) ===
    const charlie = await connection.connect({ harness, server });
    const charlieWelcome = await charlie.waitFor('welcome', 200);
    expect(charlieWelcome.data.userId).toBe('user-3');

    const charlieMessages = broadcast.listen({ client: charlie, type: 'message' });

    // Charlie missed previous messages
    expect(charlieMessages.length).toBe(0);

    // === STEP 10: Alice sends welcome to Charlie ===
    const bobMessagesBefore = bobMessages.length;
    const charlieMessagesBefore = charlieMessages.length;

    await rpc.call({
        client: alice,
        endpoint: 'message',
        data: { text: 'Welcome Charlie!', user: 'Alice' }
    });

    // Both Bob and Charlie receive the welcome message
    expect(bobMessages.length).toBe(bobMessagesBefore + 1);
    expect(charlieMessages.length).toBe(charlieMessagesBefore + 1);

    // Server should track all 3 clients
    expect(server.clientCount).toBe(3);

    // === STEP 11: Disconnect all users ===
    await connection.disconnect({ client: charlie });
    await connection.disconnect({ client: bob });
    await connection.disconnect({ client: alice });

    // Verify all clients disconnected from client side
    connection.assertDisconnected({ client: charlie });
    connection.assertDisconnected({ client: bob });
    connection.assertDisconnected({ client: alice });
};
