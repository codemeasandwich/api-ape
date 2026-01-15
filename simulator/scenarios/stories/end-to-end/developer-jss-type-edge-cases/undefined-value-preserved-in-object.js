/**
 * User sends undefined in object
 */
module.exports = async function undefinedValuePreservedInObject({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const result = await client.call('types', {
        defined: 'value',
        notDefined: undefined
    });

    expect(result.defined).toBe('value');
    expect(result.notDefined).toBeUndefined();

    await client.disconnect();
};
