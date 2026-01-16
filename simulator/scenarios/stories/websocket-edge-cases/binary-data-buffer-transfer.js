/**
 * Test: binary data transfer - sending/receiving binary data
 *
 * Tests that binary data (Buffer) can be transmitted and received
 * correctly through the WebSocket connection.
 */
module.exports = async function binaryDataBufferTransfer({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    // Create binary data with various byte values
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
    }

    // Send binary data through the types endpoint
    const result = await client.call('types', {
        buffer: binaryData
    });

    expect(result).toBeDefined();
    expect(result.buffer).toBeDefined();

    // JSS may serialize Buffer as object or preserve it - handle both cases
    let returnedBuffer;
    if (Buffer.isBuffer(result.buffer)) {
        returnedBuffer = result.buffer;
    } else if (typeof result.buffer === 'object') {
        // JSS serializes Buffer as { 0: val, 1: val, ... }
        const keys = Object.keys(result.buffer).map(Number).sort((a, b) => a - b);
        const bytes = keys.map(k => result.buffer[k]);
        returnedBuffer = Buffer.from(bytes);
    } else {
        returnedBuffer = Buffer.from(result.buffer);
    }

    expect(returnedBuffer.length).toBe(256);

    // Verify byte values
    for (let i = 0; i < 256; i++) {
        expect(returnedBuffer[i]).toBe(i);
    }
};
