/**
 * User uploads minimal file
 */
module.exports = async function singleByteFileUploadsCorrectly({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const tinyBuffer = Buffer.from([0x42]);

    const result = await client.call('files/upload', {
        name: 'tiny.bin',
        data: tinyBuffer,
        broadcast: false
    });

    expect(result.success).toBe(true);
    expect(result.size).toBe(1);

    await client.disconnect();
};
