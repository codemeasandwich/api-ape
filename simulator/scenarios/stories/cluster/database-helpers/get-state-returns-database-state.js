/**
 * Test: getState returns database state
 */
module.exports = async function getStateReturnsDatabaseState({ harness, expect }) {
    // FakeDatabase tracks state independently
    // Add some data to test getState
    harness.db.joinServer('test-server-1');
    harness.db.addClient('client-1', 'test-server-1');

    const state = harness.db.getState();

    // getState returns activeServers as array, clientCount as number
    expect(state.activeServers).toContain('test-server-1');
    expect(state.clientCount).toBe(1);

    // Cleanup
    harness.db.leaveServer('test-server-1');
};
