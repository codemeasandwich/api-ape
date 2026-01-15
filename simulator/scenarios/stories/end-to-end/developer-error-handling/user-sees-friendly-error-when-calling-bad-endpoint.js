/**
 * Complete journey: User encounters errors gracefully
 */
module.exports = async function userSeesFriendlyErrorWhenCallingBadEndpoint({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // User tries to call non-existent endpoint
    await expect(
        client.call('nonexistent/endpoint', {})
    ).rejects.toThrow();

    // Connection should still be good
    expect(client.connected).toBe(true);

    // User can still make valid calls
    const result = await client.call('echo', { test: true });
    expect(result.test).toBe(true);

    await client.disconnect();
};
