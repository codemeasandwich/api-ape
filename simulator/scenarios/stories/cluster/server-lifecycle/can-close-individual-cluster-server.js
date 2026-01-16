/**
 * Test: can close individual cluster server
 */
module.exports = async function canCloseIndividualClusterServer({ harness, expect }) {
    const servers = await harness.createCluster(3, { where: 'test-api' });

    expect(harness.servers.count).toBe(3);

    await servers[0].close();

    // Server should be closed but still in manager until removed
    expect(servers[0].closed).toBe(true);
};
