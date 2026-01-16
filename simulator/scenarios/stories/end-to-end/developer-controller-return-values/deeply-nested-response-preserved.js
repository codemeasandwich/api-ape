/**
 * Controller returns complex nested structure
 */
module.exports = async function deeplyNestedResponsePreserved({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const nested = {
        level1: {
            level2: {
                level3: {
                    array: [1, 2, 3],
                    map: new Map([['a', 1]]),
                    set: new Set(['x', 'y']),
                    date: new Date('2024-01-01')
                }
            }
        }
    };

    const result = await client.call('types', nested);

    expect(result.level1.level2.level3.array).toEqual([1, 2, 3]);
    expect(result.level1.level2.level3.map).toBeInstanceOf(Map);
    expect(result.level1.level2.level3.set).toBeInstanceOf(Set);
    expect(result.level1.level2.level3.date).toBeInstanceOf(Date);

    await client.disconnect();
};
