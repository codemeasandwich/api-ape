/**
 * End-to-End: Long polling transport workflow
 *
 * This test uses HTTP long polling instead of WebSocket:
 * 1. Connect client via polling transport
 * 2. Make RPC calls over polling
 * 3. Test multiple clients with polling
 * 4. Mixed transport scenarios
 *
 * Uses actions from: connection, rpc
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');

module.exports = async function pollingTransportWorkflow({ harness, expect }) {
    // === STEP 1: Create server ===
    const server = await harness.createServer({ where: 'test-api' });

    // === STEP 2: Connect client via polling transport ===
    const pollingClient = await connection.connect({
        harness,
        server,
        clientOptions: { transport: 'polling' }
    });

    connection.assertConnected({ client: pollingClient });
    expect(pollingClient.transport).toBe('polling');

    // === STEP 3: Make RPC call over polling ===
    const echoResult = await rpc.call({
        client: pollingClient,
        endpoint: 'echo',
        data: { clientOptions: { transport: 'polling' }, message: 'Hello via polling' }
    });

    expect(echoResult.transport).toBe('polling');
    expect(echoResult.message).toBe('Hello via polling');

    // === STEP 4: Multiple sequential calls over polling ===
    const seqResults = await rpc.callSequential({
        client: pollingClient,
        calls: [
            { endpoint: 'echo', data: { seq: 1 } },
            { endpoint: 'echo', data: { seq: 2 } },
            { endpoint: 'echo', data: { seq: 3 } }
        ]
    });

    expect(seqResults).toHaveLength(3);
    expect(seqResults.map(r => r.seq)).toEqual([1, 2, 3]);

    // === STEP 5: Connect second polling client ===
    const pollingClient2 = await connection.connect({
        harness,
        server,
        clientOptions: { transport: 'polling' }
    });

    connection.assertAllConnected({ clients: [pollingClient, pollingClient2] });

    // === STEP 6: Concurrent calls from both polling clients ===
    const [result1, result2] = await Promise.all([
        rpc.call({ client: pollingClient, endpoint: 'echo', data: { client: 1 } }),
        rpc.call({ client: pollingClient2, endpoint: 'echo', data: { client: 2 } })
    ]);

    expect(result1.client).toBe(1);
    expect(result2.client).toBe(2);

    // === STEP 7: Connect WebSocket client alongside polling clients ===
    const wsClient = await connection.connect({
        harness,
        server,
        clientOptions: { transport: 'websocket' }
    });

    expect(wsClient.transport).toBe('websocket');
    connection.assertAllConnected({ clients: [pollingClient, pollingClient2, wsClient] });

    // === STEP 8: All three clients make calls ===
    const [r1, r2, r3] = await Promise.all([
        rpc.call({ client: pollingClient, endpoint: 'echo', data: { from: 'polling1' } }),
        rpc.call({ client: pollingClient2, endpoint: 'echo', data: { from: 'polling2' } }),
        rpc.call({ client: wsClient, endpoint: 'echo', data: { from: 'websocket' } })
    ]);

    expect(r1.from).toBe('polling1');
    expect(r2.from).toBe('polling2');
    expect(r3.from).toBe('websocket');

    // === STEP 9: Error handling over polling ===
    const errorResult = await rpc.callAndExpectError({
        client: pollingClient,
        endpoint: 'errors',
        data: { type: 'sync' },
        errorMatch: /error/i
    });

    expect(errorResult).toBeDefined();

    // Client still works after error
    const afterError = await rpc.call({
        client: pollingClient,
        endpoint: 'echo',
        data: { recovered: true }
    });

    expect(afterError.recovered).toBe(true);

    // === STEP 10: Cleanup ===
    await connection.disconnect({ client: pollingClient });
    await connection.disconnect({ client: pollingClient2 });
    await connection.disconnect({ client: wsClient });

    connection.assertAllDisconnected({ clients: [pollingClient, pollingClient2, wsClient] });
};
