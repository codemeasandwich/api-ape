/**
 * End-to-End: Concurrent operations workflow
 *
 * This test stresses the system with concurrent operations:
 * 1. Multiple clients connecting simultaneously
 * 2. Concurrent RPC calls from multiple clients
 * 3. Concurrent broadcasts
 * 4. Mixed operation types
 * 5. High-volume message passing
 *
 * Uses actions from: connection, rpc, broadcast
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const broadcast = require('../../actions/broadcast');

module.exports = async function concurrentOperationsWorkflow({ harness, expect }) {
    // === STEP 1: Create server ===
    const server = await harness.createServer({ where: 'test-api' });

    // === STEP 2: Connect multiple clients concurrently ===
    const [client1, client2, client3, client4, client5] = await Promise.all([
        connection.connect({ harness, server }),
        connection.connect({ harness, server }),
        connection.connect({ harness, server }),
        connection.connect({ harness, server }),
        connection.connect({ harness, server })
    ]);

    const clients = [client1, client2, client3, client4, client5];
    connection.assertAllConnected({ clients });

    // === STEP 3: Set up broadcast listeners ===
    const listeners = clients.map(client => broadcast.listen({ client, type: 'message' }));

    // === STEP 4: Concurrent echo calls from all clients ===
    const echoResults = await Promise.all(
        clients.map((client, i) =>
            rpc.call({
                client,
                endpoint: 'echo',
                data: { clientIndex: i, timestamp: Date.now() }
            })
        )
    );

    expect(echoResults).toHaveLength(5);
    echoResults.forEach((r, i) => {
        expect(r.clientIndex).toBe(i);
    });

    // === STEP 5: Sequential then concurrent pattern ===
    // First do 3 sequential calls
    const seqResults = await rpc.callSequential({
        client: client1,
        calls: [
            { endpoint: 'echo', data: { seq: 1 } },
            { endpoint: 'echo', data: { seq: 2 } },
            { endpoint: 'echo', data: { seq: 3 } }
        ]
    });

    expect(seqResults).toHaveLength(3);
    expect(seqResults.map(r => r.seq)).toEqual([1, 2, 3]);

    // Then do concurrent calls
    const concResults = await rpc.callConcurrent({
        client: client2,
        calls: [
            { endpoint: 'echo', data: { conc: 'a' } },
            { endpoint: 'echo', data: { conc: 'b' } },
            { endpoint: 'echo', data: { conc: 'c' } }
        ]
    });

    expect(concResults).toHaveLength(3);
    const concValues = concResults.map(r => r.conc).sort();
    expect(concValues).toEqual(['a', 'b', 'c']);

    // === STEP 6: Interleaved operations from different clients ===
    const interleavedPromises = [];
    for (let i = 0; i < 10; i++) {
        const client = clients[i % 5];
        interleavedPromises.push(
            rpc.call({
                client,
                endpoint: 'echo',
                data: { interleave: i }
            })
        );
    }

    const interleavedResults = await Promise.all(interleavedPromises);
    expect(interleavedResults).toHaveLength(10);
    interleavedResults.forEach((r, i) => {
        expect(r.interleave).toBe(i);
    });

    // === STEP 7: Broadcast from one client, verify others receive ===
    await rpc.call({
        client: client1,
        endpoint: 'message',
        data: { text: 'Hello from client1', sender: 0 }
    });

    // Client1's listener shouldn't have the message (sent to others)
    expect(listeners[0].length).toBe(0);
    // Other clients should have received it
    expect(listeners[1].length).toBeGreaterThanOrEqual(1);
    expect(listeners[2].length).toBeGreaterThanOrEqual(1);

    // === STEP 8: Multiple broadcasts in rapid succession ===
    const broadcastPromises = [
        rpc.call({ client: client2, endpoint: 'message', data: { text: 'msg1', sender: 1 } }),
        rpc.call({ client: client3, endpoint: 'message', data: { text: 'msg2', sender: 2 } }),
        rpc.call({ client: client4, endpoint: 'message', data: { text: 'msg3', sender: 3 } })
    ];

    await Promise.all(broadcastPromises);

    // Each client (except sender) should have received additional messages
    // Client1 should have received all 3
    expect(listeners[0].length).toBeGreaterThanOrEqual(3);

    // === STEP 9: Test callAndExpect pattern ===
    await rpc.callAndExpect({
        client: client5,
        endpoint: 'echo',
        data: { verify: true },
        expect: { verify: true }
    });

    // === STEP 10: Mixed concurrent operation types ===
    const mixedResults = await Promise.allSettled([
        rpc.call({ client: client1, endpoint: 'echo', data: { type: 'echo1' } }),
        rpc.call({ client: client2, endpoint: 'message', data: { text: 'mixed' } }),
        rpc.call({ client: client3, endpoint: 'echo', data: { type: 'echo2' } }),
        rpc.call({ client: client4, endpoint: 'errors', data: { type: 'sync' } }),
        rpc.call({ client: client5, endpoint: 'echo', data: { type: 'echo3' } })
    ]);

    // Echoes and messages should succeed, errors should fail
    expect(mixedResults[0].status).toBe('fulfilled');
    expect(mixedResults[1].status).toBe('fulfilled');
    expect(mixedResults[2].status).toBe('fulfilled');
    expect(mixedResults[3].status).toBe('rejected');
    expect(mixedResults[4].status).toBe('fulfilled');

    // === STEP 11: Partial disconnect then continue ===
    await connection.disconnect({ client: client5 });
    await connection.disconnect({ client: client4 });

    connection.assertDisconnected({ client: client5 });
    connection.assertDisconnected({ client: client4 });
    connection.assertAllConnected({ clients: [client1, client2, client3] });

    // Remaining clients still work
    const stillWorking = await Promise.all([
        rpc.call({ client: client1, endpoint: 'echo', data: { alive: 1 } }),
        rpc.call({ client: client2, endpoint: 'echo', data: { alive: 2 } }),
        rpc.call({ client: client3, endpoint: 'echo', data: { alive: 3 } })
    ]);

    expect(stillWorking.map(r => r.alive)).toEqual([1, 2, 3]);

    // === STEP 12: Full cleanup ===
    await connection.disconnectMany({ clients: [client1, client2, client3] });

    connection.assertAllDisconnected({ clients });
};
