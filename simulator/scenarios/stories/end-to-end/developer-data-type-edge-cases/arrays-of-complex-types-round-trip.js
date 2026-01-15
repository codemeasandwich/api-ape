/**
 * User sends arrays of complex types
 */
module.exports = async function arraysOfComplexTypesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const complexArray = [
        new Date('2024-01-01'),
        new Date('2024-06-15'),
        new Date('2024-12-31')
    ];

    const result = await client.call('types', { dates: complexArray });
    expect(result.dates).toHaveLength(3);
    expect(result.dates[0]).toBeInstanceOf(Date);
    expect(result.dates[1]).toBeInstanceOf(Date);
    expect(result.dates[2]).toBeInstanceOf(Date);

    await client.disconnect();
};
