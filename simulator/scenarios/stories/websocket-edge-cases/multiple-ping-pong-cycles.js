/**
 * Test: multiple ping/pong cycles work correctly
 *
 * Tests that multiple sequential ping/pong cycles all complete
 * successfully without connection issues.
 */
module.exports = async function multiplePingPongCycles({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    const ws = client._ws;
    let pongCount = 0;

    ws.on('pong', () => {
        pongCount++;
    });

    // Send multiple pings
    const pingCount = 5;
    for (let i = 0; i < pingCount; i++) {
        ws.ping();
        await harness.wait(20);
    }

    // Wait for all pongs
    await harness.waitFor(() => pongCount >= pingCount, 1000);

    expect(pongCount).toBe(pingCount);
    expect(client.connected).toBe(true);
};
