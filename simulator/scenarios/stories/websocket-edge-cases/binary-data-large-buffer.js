/**
 * Test: large binary data transfer (64KB)
 *
 * Tests that larger binary buffers are transmitted correctly
 * through the WebSocket connection.
 */
module.exports = async function binaryDataLargeBuffer({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    // Create a larger binary buffer (64KB)
    const size = 64 * 1024;
    const binaryData = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
        binaryData[i] = i % 256;
    }

    const result = await client.call('types', {
        buffer: binaryData
    }, 5000);

    expect(result).toBeDefined();
    expect(result.buffer).toBeDefined();

    // JSS may serialize Buffer as object or preserve it
    let returnedBuffer;
    if (Buffer.isBuffer(result.buffer)) {
        returnedBuffer = result.buffer;
    } else if (typeof result.buffer === 'object') {
        const keys = Object.keys(result.buffer).map(Number).sort((a, b) => a - b);
        const bytes = keys.map(k => result.buffer[k]);
        returnedBuffer = Buffer.from(bytes);
    } else {
        returnedBuffer = Buffer.from(result.buffer);
    }

    expect(returnedBuffer.length).toBe(size);

    // Spot check values
    expect(returnedBuffer[0]).toBe(0);
    expect(returnedBuffer[255]).toBe(255);
    expect(returnedBuffer[256]).toBe(0);
    expect(returnedBuffer[size - 1]).toBe((size - 1) % 256);
};
