/**
 * Test: ping/pong keepalive - WebSocket ping frames get pong responses
 *
 * Tests that the WebSocket server properly responds to ping frames
 * with pong frames, maintaining connection keepalive.
 */
module.exports = async function pingPongKeepalive({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    // Access the underlying WebSocket
    const ws = client._ws;
    expect(ws).toBeDefined();

    // Track pong responses
    let pongReceived = false;
    ws.on('pong', () => {
        pongReceived = true;
    });

    // Send a ping frame
    ws.ping();

    // Wait for pong response
    await harness.waitFor(() => pongReceived, 1000);

    expect(pongReceived).toBe(true);
};
