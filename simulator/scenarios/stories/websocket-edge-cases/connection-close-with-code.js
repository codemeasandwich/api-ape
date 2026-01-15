/**
 * Test: connection close handshake - proper WebSocket close with codes
 *
 * Tests that the WebSocket close handshake works properly with
 * standard close codes.
 */
module.exports = async function connectionCloseWithCode({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    const ws = client._ws;
    let closeCode = null;
    let closeReason = null;

    // Listen for close event on the raw WebSocket
    ws.on('close', (code, reason) => {
        closeCode = code;
        closeReason = reason?.toString() || '';
    });

    // Close with normal closure code
    ws.close(1000, 'Normal closure');

    // Wait for close to complete
    await harness.waitFor(() => closeCode !== null, 1000);

    expect(closeCode).toBe(1000);
    expect(client.connected).toBe(false);
};
