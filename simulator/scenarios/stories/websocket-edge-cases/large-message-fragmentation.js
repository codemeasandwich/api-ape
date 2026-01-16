/**
 * Test: large message fragmentation - messages large enough to be fragmented
 *
 * Tests that large messages that exceed the WebSocket frame size
 * are properly fragmented and reassembled.
 */
module.exports = async function largeMessageFragmentation({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    // Create a large payload (100KB of data)
    const largePayload = 'x'.repeat(100 * 1024);

    // Send large message through the echo endpoint
    const result = await client.call('echo', { data: largePayload }, 5000);

    expect(result).toBeDefined();
    expect(result.data).toBe(largePayload);
    expect(result.data.length).toBe(100 * 1024);
};
