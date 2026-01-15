/**
 * End-to-End: Complex data types through RPC and broadcast
 *
 * This test chains action functions together to test JSS serialization:
 * 1. Connect multiple clients
 * 2. Send complex types (Date, RegExp, Set, Map, Error) via RPC
 * 3. Broadcast complex types to other clients
 * 4. Verify all types survive round-trip correctly
 *
 * Uses actions from: connection, rpc, broadcast, jss
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const broadcast = require('../../actions/broadcast');
const jss = require('../../actions/jss');

module.exports = async function complexDataBroadcastFlow({ harness, expect }) {
    // === STEP 1: Create server and connect clients ===
    const server = await harness.createServer({ where: 'test-api' });

    const alice = await connection.connect({ harness, server });
    const bob = await connection.connect({ harness, server });

    broadcast.listen({ client: alice, type: 'complex-data' });
    broadcast.listen({ client: bob, type: 'complex-data' });

    connection.assertAllConnected({ clients: [alice, bob] });

    // === STEP 2: Test Date round-trip via RPC ===
    const testDateValue = new Date('2024-06-15T12:30:00Z');
    const dateResult = await jss.testDate({
        client: alice,
        endpoint: 'types',
        date: testDateValue
    });

    expect(dateResult.received instanceof Date).toBe(true);
    expect(dateResult.received.getTime()).toBe(testDateValue.getTime());

    // === STEP 3: Test RegExp round-trip ===
    const testRegex = /hello.*world/gi;
    const regexResult = await jss.testRegExp({
        client: alice,
        endpoint: 'types',
        regex: testRegex
    });

    expect(regexResult.received instanceof RegExp).toBe(true);
    expect(regexResult.received.source).toBe(testRegex.source);
    expect(regexResult.received.flags).toBe(testRegex.flags);

    // === STEP 4: Test Set round-trip ===
    const testSetValue = new Set([1, 'two', 3]);
    const setResult = await jss.testSet({
        client: alice,
        endpoint: 'types',
        set: testSetValue
    });

    expect(setResult.received instanceof Set).toBe(true);
    expect(setResult.received.size).toBe(3);

    // === STEP 5: Test Map round-trip ===
    const testMapValue = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
    ]);
    const mapResult = await jss.testMap({
        client: alice,
        endpoint: 'types',
        map: testMapValue
    });

    expect(mapResult.received instanceof Map).toBe(true);
    expect(mapResult.received.size).toBe(3);
    expect(mapResult.received.get('key1')).toBe('value1');

    // === STEP 6: Test Error round-trip ===
    const testErrorValue = new Error('Test error message');
    const errorResult = await jss.testError({
        client: alice,
        endpoint: 'types',
        error: testErrorValue
    });

    expect(errorResult.received instanceof Error).toBe(true);
    expect(errorResult.received.message).toBe('Test error message');

    // === STEP 7: Test complex nested structure ===
    const complexData = {
        date: new Date('2024-01-01'),
        pattern: /test/i,
        items: new Set(['a', 'b', 'c']),
        lookup: new Map([['x', 1], ['y', 2]]),
        nested: {
            innerDate: new Date('2024-12-31'),
            innerSet: new Set([1, 2, 3])
        }
    };

    const complexResult = await rpc.call({
        client: alice,
        endpoint: 'types',
        data: { complex: complexData }
    });

    // Verify complex structure survived
    expect(complexResult.complex.date instanceof Date).toBe(true);
    expect(complexResult.complex.pattern instanceof RegExp).toBe(true);
    expect(complexResult.complex.items instanceof Set).toBe(true);
    expect(complexResult.complex.lookup instanceof Map).toBe(true);
    expect(complexResult.complex.nested.innerDate instanceof Date).toBe(true);

    // === STEP 8: Test TypeError ===
    const typeError = new TypeError('Invalid type');
    const typeErrorResult = await jss.testError({
        client: bob,
        endpoint: 'types',
        error: typeError
    });

    expect(typeErrorResult.received instanceof TypeError).toBe(true);
    expect(typeErrorResult.received.message).toBe('Invalid type');

    // === STEP 9: Test null preservation (null is preserved, undefined may be dropped) ===
    const withNull = {
        defined: 'value',
        nullValue: null,
        _requestId: 'null-test-1'
    };

    const nullResult = await rpc.call({
        client: bob,
        endpoint: 'echo',
        data: withNull
    });

    expect(nullResult.defined).toBe('value');
    expect(nullResult.nullValue).toBe(null);

    // === STEP 10: Multiple sequential type tests ===
    const sequentialResults = await rpc.callSequential({
        client: alice,
        calls: [
            { endpoint: 'types', data: { date: new Date('2024-03-15') } },
            { endpoint: 'types', data: { set: new Set([10, 20, 30]) } },
            { endpoint: 'types', data: { map: new Map([['a', 1]]) } }
        ]
    });

    expect(sequentialResults[0].date instanceof Date).toBe(true);
    expect(sequentialResults[1].set instanceof Set).toBe(true);
    expect(sequentialResults[2].map instanceof Map).toBe(true);

    // === STEP 11: Concurrent complex type calls ===
    const concurrentResults = await rpc.callConcurrent({
        client: bob,
        calls: [
            { endpoint: 'types', data: { value: new Date() } },
            { endpoint: 'types', data: { value: new Set([1]) } },
            { endpoint: 'types', data: { value: /pattern/ } }
        ]
    });

    expect(concurrentResults).toHaveLength(3);
    const types = concurrentResults.map(r => {
        if (r.value instanceof Date) return 'Date';
        if (r.value instanceof Set) return 'Set';
        if (r.value instanceof RegExp) return 'RegExp';
        return 'unknown';
    }).sort();
    expect(types).toEqual(['Date', 'RegExp', 'Set']);

    // === STEP 12: Cleanup ===
    await connection.disconnect({ client: alice });
    await connection.disconnect({ client: bob });

    connection.assertAllDisconnected({ clients: [alice, bob] });
};
