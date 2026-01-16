/**
 * Test: reset clears all database state
 */
module.exports = async function resetClearsAllDatabaseState({ harness, expect }) {
    // Manually add data
    harness.db.joinServer('test-server-1');
    harness.db.joinServer('test-server-2');
    harness.db.addClient('client-1', 'test-server-1');

    expect(harness.db.activeServers.size).toBe(2);

    harness.db.reset();

    expect(harness.db.activeServers.size).toBe(0);
};
