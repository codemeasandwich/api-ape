/**
 * End-to-End: Edge case and stress testing workflow
 *
 * This test chains action functions together to test boundary conditions:
 * 1. Large payloads
 * 2. Deep nesting
 * 3. Special characters
 * 4. Null values
 * 5. Empty payloads
 * 6. Rapid calls
 * 7. Many clients
 * 8. Broadcast to empty
 *
 * Uses actions from: connection, rpc, edge-cases
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const edgeCases = require('../../actions/edge-cases');

module.exports = async function edgeCaseStressTests({ harness, expect }) {
    // === STEP 1: Create server and connect ===
    const server = await harness.createServer({ where: 'test-api' });
    const client = await connection.connect({ harness, server });

    connection.assertConnected({ client });

    // === STEP 2: Test large payload ===
    const largePayloadResult = await edgeCases.callWithLargePayload({
        client,
        endpoint: 'echo',
        sizeBytes: 10000
    });

    expect(largePayloadResult.sent).toBe(10000);
    expect(largePayloadResult.received).toBe(10000);
    expect(largePayloadResult.matches).toBe(true);

    // === STEP 3: Test deep nesting ===
    const deepNestResult = await edgeCases.callWithDeepNesting({
        client,
        endpoint: 'echo',
        depth: 20
    });

    expect(deepNestResult.matches).toBe(true);

    // === STEP 4: Test special characters ===
    const specialCharsResult = await edgeCases.callWithSpecialChars({
        client,
        endpoint: 'echo'
    });

    expect(specialCharsResult.matches).toBe(true);

    // === STEP 5: Test null values ===
    const nullResult = await edgeCases.callWithNullValues({
        client,
        endpoint: 'echo'
    });

    expect(nullResult.nullValue).toBe(null);
    expect(nullResult.nullArray[0]).toBe(null);
    expect(nullResult.nested.inner).toBe(null);

    // === STEP 6: Test empty payload ===
    const emptyResult = await edgeCases.callWithEmptyPayload({
        client,
        endpoint: 'echo'
    });

    expect(emptyResult).toBeDefined();

    // === STEP 7: Test rapid calls ===
    const rapidResult = await edgeCases.rapidCalls({
        client,
        endpoint: 'echo',
        count: 20
    });

    expect(rapidResult.success).toBe(20);
    expect(rapidResult.failed).toBe(0);

    // === STEP 8: Broadcast to empty (single client broadcasts) ===
    const broadcastResult = await edgeCases.broadcastToEmpty({
        client,
        endpoint: 'message',
        data: { text: 'Hello to nobody' }
    });

    expect(broadcastResult.success).toBe(true);

    // === STEP 9: Add more clients for multi-client testing ===
    const client2 = await connection.connect({ harness, server });
    const client3 = await connection.connect({ harness, server });

    connection.assertAllConnected({ clients: [client, client2, client3] });

    // === STEP 10: Concurrent large payloads from multiple clients ===
    const [large1, large2, large3] = await Promise.all([
        edgeCases.callWithLargePayload({ client, endpoint: 'echo', sizeBytes: 5000 }),
        edgeCases.callWithLargePayload({ client: client2, endpoint: 'echo', sizeBytes: 5000 }),
        edgeCases.callWithLargePayload({ client: client3, endpoint: 'echo', sizeBytes: 5000 })
    ]);

    expect(large1.matches).toBe(true);
    expect(large2.matches).toBe(true);
    expect(large3.matches).toBe(true);

    // === STEP 11: Sequential mixed operations ===
    const results = [];
    for (let i = 0; i < 5; i++) {
        const r = await edgeCases.callWithDeepNesting({
            client: i % 3 === 0 ? client : (i % 3 === 1 ? client2 : client3),
            endpoint: 'echo',
            depth: 5 + i
        });
        results.push(r);
    }

    expect(results.every(r => r.matches)).toBe(true);

    // === STEP 12: Missing endpoint error ===
    const missingError = await edgeCases.callMissingEndpoint({
        client
    });

    expect(missingError).toBeDefined();
    expect(missingError.message).toBeDefined();

    // === STEP 13: Cleanup ===
    await connection.disconnect({ client });
    await connection.disconnect({ client: client2 });
    await connection.disconnect({ client: client3 });

    connection.assertAllDisconnected({ clients: [client, client2, client3] });
};
