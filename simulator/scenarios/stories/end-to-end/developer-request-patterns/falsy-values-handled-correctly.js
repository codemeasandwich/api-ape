/**
 * User sends request with all falsy values
 */
module.exports = async function falsyValuesHandledCorrectly({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const result = await client.call('echo', {
        zero: 0,
        emptyString: '',
        falseVal: false,
        nullVal: null
    });

    expect(result.zero).toBe(0);
    expect(result.emptyString).toBe('');
    expect(result.falseVal).toBe(false);
    expect(result.nullVal).toBeNull();

    await client.disconnect();
};
