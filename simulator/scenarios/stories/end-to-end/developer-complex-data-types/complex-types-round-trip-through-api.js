/**
 * Complete journey: User sends/receives complex JS types
 *
 * Steps:
 * 1. Server starts
 * 2. User connects
 * 3. User sends Date, RegExp, Set, Map in one call
 * 4. User receives them back with types preserved
 */
module.exports = async function complexTypesRoundTripThroughApi({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Send complex data
    const testDate = new Date('2024-06-15T12:30:00Z');
    const testRegex = /hello-\d+/gi;
    const testSet = new Set(['a', 'b', 'c']);
    const testMap = new Map([['key1', 100], ['key2', 200]]);

    const result = await client.call('types', {
        date: testDate,
        regex: testRegex,
        set: testSet,
        map: testMap
    });

    // Verify types preserved
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.getTime()).toBe(testDate.getTime());

    expect(result.regex).toBeInstanceOf(RegExp);
    expect(result.regex.source).toBe(testRegex.source);

    expect(result.set).toBeInstanceOf(Set);
    expect(result.set.size).toBe(3);

    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get('key1')).toBe(100);

    await client.disconnect();
};
