/**
 * User sends RegExp without flags (edge case)
 */
module.exports = async function simpleRegExpPatternSurvivesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const simpleRegex = /simple/;
    const result = await client.call('types', { regex: simpleRegex });

    expect(result.regex).toBeInstanceOf(RegExp);
    expect(result.regex.source).toBe('simple');

    await client.disconnect();
};
