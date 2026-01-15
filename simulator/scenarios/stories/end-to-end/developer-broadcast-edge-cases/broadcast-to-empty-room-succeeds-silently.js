/**
 * Broadcast when only sender is connected
 */
module.exports = async function broadcastToEmptyRoomSucceedsSilently({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const alice = await harness.createClientForServer(server);

    // Alice is alone - broadcast should still succeed
    const result = await alice.call('message', { text: 'Hello?' });

    expect(result.success).toBe(true);

    await alice.disconnect();
};
