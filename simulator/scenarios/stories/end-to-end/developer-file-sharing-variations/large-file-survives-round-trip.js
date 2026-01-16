/**
 * Large file upload/download round-trip
 */
module.exports = async function largeFileSurvivesRoundTrip({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Create 100KB file
    const largeData = Buffer.alloc(100 * 1024);
    for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
    }

    const uploadResult = await client.call('files/upload', {
        name: 'large-file.bin',
        data: largeData,
        broadcast: false
    });

    const downloadResult = await client.call('files/download', {
        hash: uploadResult.hash
    });

    expect(downloadResult.size).toBe(largeData.length);

    await client.disconnect();
};
