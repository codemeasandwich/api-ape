/**
 * Test: cleanup closes all cluster servers
 */
module.exports = async function cleanupClosesAllClusterServers({ harness, expect }) {
    await harness.createCluster(3, { where: 'test-api' });

    expect(harness.servers.count).toBe(3);

    await harness.cleanup();

    expect(harness.servers.count).toBe(0);
};
