/**
 * End-to-End: User authentication and authorization flow
 *
 * This test chains action functions together to test:
 * 1. Server with embed-based authentication
 * 2. Different users with different roles connect
 * 3. Each user can access their own context via RPC
 * 4. Role-based data access
 * 5. Session persistence across multiple calls
 *
 * Uses actions from: connection, rpc, lifecycle
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const lifecycle = require('../../actions/lifecycle');

module.exports = async function userAuthenticationFlow({ harness, expect }) {
    let userIdCounter = 0;
    const connectedUsers = new Map();

    // === STEP 1: Create server with authentication ===
    const { server, events } = await lifecycle.createServerWithEmbed({
        harness,
        where: 'test-api',
        embed: (socket, req, send) => {
            userIdCounter++;
            const userId = `user-${userIdCounter}`;
            const role = userIdCounter === 1 ? 'admin' : 'user';
            connectedUsers.set(userId, { role, connectedAt: Date.now() });

            // Send auth success message
            send('auth-success', { userId, role });

            return { userId, role };
        }
    });

    // === STEP 2: Admin connects first ===
    const admin = await connection.connect({ harness, server });
    const adminAuth = await admin.waitFor('auth-success', 200);
    expect(adminAuth.data.userId).toBe('user-1');
    expect(adminAuth.data.role).toBe('admin');

    // === STEP 3: Regular user connects ===
    const user = await connection.connect({ harness, server });
    const userAuth = await user.waitFor('auth-success', 200);
    expect(userAuth.data.userId).toBe('user-2');
    expect(userAuth.data.role).toBe('user');

    // === STEP 4: Admin queries their profile ===
    const adminProfile = await rpc.call({
        client: admin,
        endpoint: 'users/profile',
        data: { _requestId: 'admin-profile-1' }
    });

    expect(adminProfile.userId).toBe('user-1');
    expect(adminProfile.role).toBe('admin');
    expect(adminProfile.clientId).toBeDefined();

    // === STEP 5: User queries their profile ===
    const userProfile = await rpc.call({
        client: user,
        endpoint: 'users/profile',
        data: { _requestId: 'user-profile-1' }
    });

    expect(userProfile.userId).toBe('user-2');
    expect(userProfile.role).toBe('user');
    expect(userProfile.clientId).toBeDefined();

    // Different client IDs
    expect(adminProfile.clientId).not.toBe(userProfile.clientId);

    // === STEP 6: Multiple calls maintain session ===
    const adminProfile2 = await rpc.call({
        client: admin,
        endpoint: 'users/profile',
        data: { _requestId: 'admin-profile-2' }
    });

    // Same client ID across calls
    expect(adminProfile2.clientId).toBe(adminProfile.clientId);
    expect(adminProfile2.userId).toBe('user-1');

    // === STEP 7: Sequential calls to different endpoints ===
    const calls = await rpc.callSequential({
        client: admin,
        calls: [
            { endpoint: 'echo', data: { step: 1 } },
            { endpoint: 'echo', data: { step: 2 } },
            { endpoint: 'users/profile', data: { _requestId: 'admin-profile-3' } }
        ]
    });

    expect(calls).toHaveLength(3);
    expect(calls[0].step).toBe(1);
    expect(calls[1].step).toBe(2);
    expect(calls[2].userId).toBe('user-1');

    // === STEP 8: Concurrent calls work correctly ===
    const concurrent = await rpc.callConcurrent({
        client: user,
        calls: [
            { endpoint: 'echo', data: { id: 'a' } },
            { endpoint: 'echo', data: { id: 'b' } },
            { endpoint: 'echo', data: { id: 'c' } }
        ]
    });

    expect(concurrent).toHaveLength(3);
    const ids = concurrent.map(r => r.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);

    // === STEP 9: Third user connects ===
    const user3 = await connection.connect({ harness, server });
    const user3Auth = await user3.waitFor('auth-success', 200);
    expect(user3Auth.data.userId).toBe('user-3');
    expect(user3Auth.data.role).toBe('user');

    // === STEP 10: All users still functional ===
    connection.assertAllConnected({ clients: [admin, user, user3] });

    // === STEP 11: User disconnects, others continue ===
    await connection.disconnect({ client: user });

    connection.assertConnected({ client: admin });
    connection.assertConnected({ client: user3 });
    connection.assertDisconnected({ client: user });

    // Admin can still make calls
    const stillWorking = await rpc.call({
        client: admin,
        endpoint: 'echo',
        data: { stillAlive: true }
    });
    expect(stillWorking.stillAlive).toBe(true);

    // === STEP 12: Cleanup ===
    await connection.disconnect({ client: admin });
    await connection.disconnect({ client: user3 });

    connection.assertAllDisconnected({ clients: [admin, user, user3] });
};
