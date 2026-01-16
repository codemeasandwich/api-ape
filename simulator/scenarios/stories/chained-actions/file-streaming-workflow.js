/**
 * End-to-End: File streaming and chunked transfer workflow
 *
 * This test focuses on file operations with various sizes and patterns:
 * 1. Small file upload/download
 * 2. Larger file upload/download
 * 3. Binary data patterns
 * 4. Concurrent uploads
 * 5. Download verification
 *
 * Uses actions from: connection, files
 */

const connection = require('../../actions/connection');
const files = require('../../actions/files');

module.exports = async function fileStreamingWorkflow({ harness, expect }) {
    // === STEP 1: Create server and connect ===
    const server = await harness.createServer({ where: 'test-api' });
    const client = await connection.connect({ harness, server });

    connection.assertConnected({ client });

    // === STEP 2: Upload small file ===
    const smallData = files.createTestData({ sizeBytes: 100 });
    const smallUpload = await files.upload({
        client,
        endpoint: 'files/upload',
        filename: 'small.bin',
        data: smallData
    });

    expect(smallUpload.success).toBe(true);
    expect(smallUpload.hash).toBeDefined();

    // === STEP 3: Download and verify small file ===
    const smallDownload = await files.download({
        client,
        endpoint: 'files/download',
        params: { hash: smallUpload.hash }
    });

    expect(smallDownload.name).toBe('small.bin');
    expect(smallDownload.size).toBe(smallData.length);

    // === STEP 4: Upload medium file ===
    const mediumData = files.createTestData({ sizeBytes: 5000 });
    const mediumUpload = await files.upload({
        client,
        endpoint: 'files/upload',
        filename: 'medium.bin',
        data: mediumData
    });

    expect(mediumUpload.success).toBe(true);

    // === STEP 5: Upload with sequential pattern ===
    const sequentialData = files.createTestData({ sizeBytes: 2000, pattern: 'sequential' });
    const seqUpload = await files.upload({
        client,
        endpoint: 'files/upload',
        filename: 'sequential.bin',
        data: sequentialData
    });

    expect(seqUpload.success).toBe(true);

    // === STEP 6: Upload with zeros pattern ===
    const zerosData = files.createTestData({ sizeBytes: 1000, pattern: 'zeros' });
    const zerosUpload = await files.upload({
        client,
        endpoint: 'files/upload',
        filename: 'zeros.bin',
        data: zerosData
    });

    expect(zerosUpload.success).toBe(true);

    // === STEP 7: Connect second client ===
    const client2 = await connection.connect({ harness, server });

    // === STEP 8: Concurrent uploads from both clients ===
    const [upload1, upload2] = await Promise.all([
        files.upload({
            client,
            endpoint: 'files/upload',
            filename: 'client1.txt',
            data: Buffer.from('Client 1 content')
        }),
        files.upload({
            client: client2,
            endpoint: 'files/upload',
            filename: 'client2.txt',
            data: Buffer.from('Client 2 content')
        })
    ]);

    expect(upload1.success).toBe(true);
    expect(upload2.success).toBe(true);

    // === STEP 9: Cross-client downloads ===
    const download1FromClient2 = await files.download({
        client: client2,
        endpoint: 'files/download',
        params: { hash: upload1.hash }
    });

    const download2FromClient1 = await files.download({
        client,
        endpoint: 'files/download',
        params: { hash: upload2.hash }
    });

    expect(download1FromClient2.name).toBe('client1.txt');
    expect(download2FromClient1.name).toBe('client2.txt');

    // === STEP 10: Verify all downloads work ===
    const mediumDownload = await files.download({
        client,
        endpoint: 'files/download',
        params: { hash: mediumUpload.hash }
    });

    expect(mediumDownload.size).toBe(mediumData.length);

    // === STEP 11: Upload text file ===
    const textContent = JSON.stringify({
        message: 'Hello World',
        timestamp: new Date().toISOString(),
        metadata: {
            version: 1,
            author: 'test'
        }
    });

    const textUpload = await files.upload({
        client,
        endpoint: 'files/upload',
        filename: 'data.json',
        data: Buffer.from(textContent)
    });

    expect(textUpload.success).toBe(true);

    // === STEP 12: Cleanup ===
    await connection.disconnect({ client });
    await connection.disconnect({ client: client2 });

    connection.assertAllDisconnected({ clients: [client, client2] });
};
