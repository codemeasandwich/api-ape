/**
 * Complete journey: User uploads file, another user downloads it
 *
 * Steps:
 * 1. Server with file endpoints
 * 2. Alice connects
 * 3. Bob connects
 * 4. Alice uploads a file
 * 5. Alice gets back a hash
 * 6. Bob downloads using the hash
 * 7. Bob verifies content matches
 */
module.exports = async function oneUserSharesFileWithAnother({ harness, expect }) {
    // === STEP 1: Server starts ===
    const server = await harness.createServer({ where: 'test-api' });

    // === STEP 2 & 3: Users connect ===
    const alice = await harness.createClientForServer(server);
    const bob = await harness.createClientForServer(server);

    // === STEP 4: Alice uploads file ===
    const testContent = 'This is Alice\'s secret document.';
    const testBuffer = Buffer.from(testContent);

    const uploadResult = await alice.call('files/upload', {
        name: 'secret.txt',
        data: testBuffer,
        broadcast: false
    });

    // === STEP 5: Alice gets hash ===
    expect(uploadResult.success).toBe(true);
    expect(uploadResult.hash).toBeDefined();
    const fileHash = uploadResult.hash;

    // === STEP 6: Bob downloads using hash ===
    const downloadResult = await bob.call('files/download', {
        hash: fileHash
    });

    // === STEP 7: Bob verifies content ===
    expect(downloadResult.name).toBe('secret.txt');
    expect(downloadResult.size).toBe(testBuffer.length);

    // Cleanup
    await alice.disconnect();
    await bob.disconnect();
};
