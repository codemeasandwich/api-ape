/**
 * User sends empty objects and nulls
 */
module.exports = async function emptyAndNullValuesHandledCorrectly({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const result = await client.call('echo', {
        empty: {},
        nullValue: null,
        emptyArray: [],
        emptyString: ''
    });

    expect(result.empty).toEqual({});
    expect(result.nullValue).toBeNull();
    expect(result.emptyArray).toEqual([]);
    expect(result.emptyString).toBe('');

    await client.disconnect();
};
