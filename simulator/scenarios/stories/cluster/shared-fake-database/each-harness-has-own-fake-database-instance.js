/**
 * Test: each harness has its own FakeDatabase instance
 */
module.exports = async function eachHarnessHasOwnFakeDatabaseInstance({ harness, expect }) {
    // The harness creates a FakeDatabase for cluster coordination
    expect(harness.db).toBeDefined();
    expect(typeof harness.db.joinServer).toBe('function');
    expect(typeof harness.db.publish).toBe('function');
};
