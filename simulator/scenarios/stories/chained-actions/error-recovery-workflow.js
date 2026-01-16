/**
 * End-to-End: Error handling and recovery workflow
 *
 * This test chains action functions together to test error scenarios:
 * 1. Connect client
 * 2. Make successful call
 * 3. Call endpoint that throws
 * 4. Verify client can recover
 * 5. Test missing endpoint error
 * 6. Test async error handling
 * 7. Verify client remains functional after errors
 *
 * Uses actions from: connection, rpc
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');

module.exports = async function errorRecoveryWorkflow({ harness, expect }) {
    // === STEP 1: Create server and connect ===
    const server = await harness.createServer({ where: 'test-api' });
    const client = await connection.connect({ harness, server });

    connection.assertConnected({ client });

    // === STEP 2: Successful call first ===
    const echoResult = await rpc.call({
        client,
        endpoint: 'echo',
        data: { test: 'initial' }
    });

    expect(echoResult.test).toBe('initial');

    // === STEP 3: Call endpoint that throws sync error ===
    const syncError = await rpc.callAndExpectError({
        client,
        endpoint: 'errors',
        data: { type: 'sync' },
        errorMatch: /error/i
    });

    expect(syncError).toBeDefined();

    // === STEP 4: Verify client still works after error ===
    const afterError1 = await rpc.call({
        client,
        endpoint: 'echo',
        data: { recovered: true }
    });

    expect(afterError1.recovered).toBe(true);
    connection.assertConnected({ client });

    // === STEP 5: Call endpoint that throws async error ===
    const asyncError = await rpc.callAndExpectError({
        client,
        endpoint: 'errors',
        data: { type: 'async', delay: 10 },
        errorMatch: /error/i
    });

    expect(asyncError).toBeDefined();

    // === STEP 6: Still functional after async error ===
    const afterError2 = await rpc.call({
        client,
        endpoint: 'echo',
        data: { stillWorking: 'yes' }
    });

    expect(afterError2.stillWorking).toBe('yes');

    // === STEP 7: Test missing endpoint ===
    const missingError = await rpc.callAndExpectError({
        client,
        endpoint: 'nonexistent/endpoint',
        data: {}
    });

    expect(missingError).toBeDefined();

    // === STEP 8: Multiple errors in sequence ===
    for (let i = 0; i < 3; i++) {
        const err = await rpc.callAndExpectError({
            client,
            endpoint: 'errors',
            data: { type: 'sync', iteration: i }
        });
        expect(err).toBeDefined();
    }

    // === STEP 9: Still functional after multiple errors ===
    const finalCheck = await rpc.call({
        client,
        endpoint: 'echo',
        data: { final: 'check' }
    });

    expect(finalCheck.final).toBe('check');
    connection.assertConnected({ client });

    // === STEP 10: Mix of success and errors ===
    const results = [];
    for (const endpoint of ['echo', 'errors', 'echo', 'errors', 'echo']) {
        try {
            const result = await rpc.call({
                client,
                endpoint,
                data: endpoint === 'errors' ? { type: 'sync' } : { ok: true }
            });
            results.push({ success: true, result });
        } catch (err) {
            results.push({ success: false, error: err });
        }
    }

    // Verify pattern: success, fail, success, fail, success
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
    expect(results[3].success).toBe(false);
    expect(results[4].success).toBe(true);

    // === STEP 11: Add second client, verify isolation ===
    const client2 = await connection.connect({ harness, server });

    // Client 2 works while client 1 had errors
    const client2Result = await rpc.call({
        client: client2,
        endpoint: 'echo',
        data: { newClient: true }
    });

    expect(client2Result.newClient).toBe(true);

    // Both clients still connected
    expect(connection.getClientCount({ server })).toBe(2);
    connection.assertAllConnected({ clients: [client, client2] });

    // === STEP 12: Concurrent error calls ===
    const concurrentErrors = await Promise.allSettled([
        rpc.call({ client, endpoint: 'errors', data: { type: 'sync', id: 1 } }),
        rpc.call({ client: client2, endpoint: 'echo', data: { id: 2 } }),
        rpc.call({ client, endpoint: 'errors', data: { type: 'async', id: 3 } }),
        rpc.call({ client: client2, endpoint: 'echo', data: { id: 4 } })
    ]);

    // Errors rejected, echoes fulfilled
    expect(concurrentErrors[0].status).toBe('rejected');
    expect(concurrentErrors[1].status).toBe('fulfilled');
    expect(concurrentErrors[2].status).toBe('rejected');
    expect(concurrentErrors[3].status).toBe('fulfilled');

    // === STEP 13: Both clients still functional ===
    const finalClient1 = await rpc.call({
        client,
        endpoint: 'echo',
        data: { client: 1 }
    });
    const finalClient2 = await rpc.call({
        client: client2,
        endpoint: 'echo',
        data: { client: 2 }
    });

    expect(finalClient1.client).toBe(1);
    expect(finalClient2.client).toBe(2);

    // === STEP 14: Cleanup ===
    await connection.disconnect({ client });
    await connection.disconnect({ client: client2 });

    // Verify disconnected from client side
    connection.assertDisconnected({ client });
    connection.assertDisconnected({ client: client2 });
};
