/**
 * Test: very large message (500KB) survives roundtrip
 *
 * Tests that very large messages that require multiple WebSocket frames
 * are properly transmitted and received intact.
 */
module.exports = async function veryLargeMessageSurvivesRoundtrip({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    // Create a very large payload (500KB)
    const size = 500 * 1024;
    const largePayload = [];
    for (let i = 0; i < size; i++) {
        largePayload.push(String.fromCharCode(65 + (i % 26)));
    }
    const data = largePayload.join('');

    const result = await client.call('echo', { data }, 10000);

    expect(result.data.length).toBe(size);
    // Verify the pattern is intact
    expect(result.data.charAt(0)).toBe('A');
    expect(result.data.charAt(25)).toBe('Z');
    expect(result.data.charAt(26)).toBe('A');
};
