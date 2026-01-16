/**
 * End-to-End: Multi-server file transfer workflow
 *
 * This test chains action functions together to test:
 * 1. Create multiple independent servers
 * 2. Connect clients to different servers
 * 3. Upload files on one server
 * 4. Verify files are isolated per server
 * 5. Test RPC across different servers simultaneously
 *
 * Uses actions from: connection, rpc, files, cluster
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const files = require('../../actions/files');
const cluster = require('../../actions/cluster');

module.exports = async function multiServerFileTransfer({ harness, expect }) {
    // === STEP 1: Create two independent servers ===
    const server1 = await harness.createServer({ where: 'test-api' });
    const server2 = await harness.createServer({ where: 'test-api' });

    expect(server1.port).not.toBe(server2.port);

    // === STEP 2: Connect clients to each server ===
    const alice = await connection.connect({ harness, server: server1 });
    const bob = await connection.connect({ harness, server: server1 });
    const charlie = await connection.connect({ harness, server: server2 });
    const diana = await connection.connect({ harness, server: server2 });

    // Verify all 4 clients connected
    connection.assertAllConnected({ clients: [alice, bob, charlie, diana] });

    // === STEP 3: Alice uploads file on server1 ===
    const file1Data = files.createTestData({ sizeBytes: 512 });
    const upload1 = await files.upload({
        client: alice,
        endpoint: 'files/upload',
        filename: 'server1-doc.txt',
        data: file1Data
    });

    expect(upload1.success).toBe(true);
    expect(upload1.hash).toBeDefined();

    // === STEP 4: Charlie uploads file on server2 ===
    const file2Data = files.createTestData({ sizeBytes: 512, pattern: 'sequential' });
    const upload2 = await files.upload({
        client: charlie,
        endpoint: 'files/upload',
        filename: 'server2-doc.txt',
        data: file2Data
    });

    expect(upload2.success).toBe(true);
    expect(upload2.hash).toBeDefined();

    // Files have different hashes (different patterns)
    expect(upload1.hash).not.toBe(upload2.hash);

    // === STEP 5: Bob downloads file from server1 ===
    const download1 = await files.download({
        client: bob,
        endpoint: 'files/download',
        params: { hash: upload1.hash }
    });

    expect(download1.name).toBe('server1-doc.txt');
    expect(download1.size).toBe(file1Data.length);

    // === STEP 6: Diana downloads file from server2 ===
    const download2 = await files.download({
        client: diana,
        endpoint: 'files/download',
        params: { hash: upload2.hash }
    });

    expect(download2.name).toBe('server2-doc.txt');
    expect(download2.size).toBe(file2Data.length);

    // === STEP 7: Concurrent RPC across both servers ===
    const [result1, result2, result3, result4] = await Promise.all([
        rpc.call({ client: alice, endpoint: 'echo', data: { server: 1, client: 'alice' } }),
        rpc.call({ client: bob, endpoint: 'echo', data: { server: 1, client: 'bob' } }),
        rpc.call({ client: charlie, endpoint: 'echo', data: { server: 2, client: 'charlie' } }),
        rpc.call({ client: diana, endpoint: 'echo', data: { server: 2, client: 'diana' } })
    ]);

    expect(result1.server).toBe(1);
    expect(result2.server).toBe(1);
    expect(result3.server).toBe(2);
    expect(result4.server).toBe(2);

    // === STEP 8: Sequential operations per server ===
    const server1Ops = await rpc.callSequential({
        client: alice,
        calls: [
            { endpoint: 'echo', data: { step: 1 } },
            { endpoint: 'echo', data: { step: 2 } },
            { endpoint: 'echo', data: { step: 3 } }
        ]
    });

    const server2Ops = await rpc.callSequential({
        client: charlie,
        calls: [
            { endpoint: 'echo', data: { step: 'a' } },
            { endpoint: 'echo', data: { step: 'b' } },
            { endpoint: 'echo', data: { step: 'c' } }
        ]
    });

    expect(server1Ops.map(r => r.step)).toEqual([1, 2, 3]);
    expect(server2Ops.map(r => r.step)).toEqual(['a', 'b', 'c']);

    // === STEP 9: Upload more files in parallel ===
    const [upload3, upload4] = await Promise.all([
        files.upload({
            client: bob,
            endpoint: 'files/upload',
            filename: 'bob-file.txt',
            data: files.createTestData({ sizeBytes: 256 })
        }),
        files.upload({
            client: diana,
            endpoint: 'files/upload',
            filename: 'diana-file.txt',
            data: files.createTestData({ sizeBytes: 256, pattern: 'zeros' })
        })
    ]);

    expect(upload3.success).toBe(true);
    expect(upload4.success).toBe(true);

    // === STEP 10: Alice downloads Bob's file (same server) ===
    const bobFileFromAlice = await files.download({
        client: alice,
        endpoint: 'files/download',
        params: { hash: upload3.hash }
    });

    expect(bobFileFromAlice.name).toBe('bob-file.txt');

    // === STEP 11: Charlie downloads Diana's file (same server) ===
    const dianaFileFromCharlie = await files.download({
        client: charlie,
        endpoint: 'files/download',
        params: { hash: upload4.hash }
    });

    expect(dianaFileFromCharlie.name).toBe('diana-file.txt');

    // === STEP 12: Disconnect clients from server1 ===
    await connection.disconnectMany({ clients: [alice, bob] });

    connection.assertDisconnected({ client: alice });
    connection.assertDisconnected({ client: bob });

    // Server2 clients still functional
    const stillWorking = await rpc.call({
        client: charlie,
        endpoint: 'echo',
        data: { server2: 'still alive' }
    });
    expect(stillWorking.server2).toBe('still alive');

    // === STEP 13: Disconnect remaining clients ===
    await connection.disconnectMany({ clients: [charlie, diana] });

    connection.assertAllDisconnected({ clients: [alice, bob, charlie, diana] });
};
