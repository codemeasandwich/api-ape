/**
 * Test: connection close with "going away" code
 *
 * Tests that the WebSocket close handshake works with the
 * 1001 "going away" close code (e.g., page navigation).
 */
module.exports = async function connectionCloseGoingAway({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    const ws = client._ws;
    let closeCode = null;

    ws.on('close', (code) => {
        closeCode = code;
    });

    // Close with going away code (simulates page navigation)
    ws.close(1001, 'Going away');

    await harness.waitFor(() => closeCode !== null, 1000);

    expect(closeCode).toBe(1001);
    expect(client.state).toBe('disconnected');
};
