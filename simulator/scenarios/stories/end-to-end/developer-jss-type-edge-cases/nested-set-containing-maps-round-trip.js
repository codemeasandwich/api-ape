/**
 * User sends mixed Set and Map
 */
module.exports = async function nestedSetContainingMapsRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const complexData = {
        set: new Set([1, 2, 3]),
        map: new Map([['a', 1], ['b', 2]]),
        nested: {
            innerSet: new Set(['x', 'y']),
            innerMap: new Map([['key', 'value']])
        }
    };

    const result = await client.call('types', complexData);

    expect(result.set).toBeInstanceOf(Set);
    expect(result.set.size).toBe(3);
    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get('a')).toBe(1);
    expect(result.nested.innerSet).toBeInstanceOf(Set);
    expect(result.nested.innerMap).toBeInstanceOf(Map);

    await client.disconnect();
};
