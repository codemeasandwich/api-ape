/**
 * Test: each server has unique port
 */
module.exports = async function eachServerHasUniquePort({ harness, expect }) {
    const servers = await harness.createCluster(3, { where: 'test-api' });

    const ports = servers.map((s) => s.port);
    expect(new Set(ports).size).toBe(3);
};
