/**
 * Test: can create a cluster of servers
 */
module.exports = async function canCreateClusterOfServers({ harness, expect }) {
    const servers = await harness.createCluster(3, { where: 'test-api' });

    expect(servers).toHaveLength(3);
    servers.forEach((server) => {
        expect(server.closed).toBe(false);
        expect(server.url).toContain('localhost');
    });
};
