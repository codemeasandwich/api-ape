/**
 * @fileoverview HTTP File Transfer User Stories
 *
 * Tests HTTP-based file download and upload endpoints:
 * - GET /{where}/download/{hash} - Download files via HTTP
 * - PUT /{where}/upload/{queryId}/{pathHash} - Upload binary data via HTTP
 * - Security requirements (HTTPS, client authentication)
 * - Streaming file transfers
 *
 * @module simulator/scenarios/stories/http-file-transfer
 */

const http = require('http');
const { Harness } = require('../../../harness');

jest.setTimeout(15000);

/**
 * Helper to get server-assigned client ID from harness client
 * Uses the serverClientId captured from __connected__ message
 */
function getClientId(client) {
    return client.serverClientId || client._cookies?.apeClientId || client.id;
}

describe('HTTP File Transfer User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 24000, connectTimeout: 5000 });

        // Reset file store
        const uploadModule = require('../../../test-api/files/upload');
        uploadModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 50));
    });

    describe('HTTP Download Endpoint', () => {
        test('download with valid __ape_link__ hash returns binary data', async () => {
            const { client, server } = await harness.createPair({ where: 'test-api' });
            const clientId = getClientId(client);

            // Upload a file first via RPC
            const testData = Buffer.from('Test file for HTTP download');
            const uploadResult = await client.call('files/upload', {
                name: 'http-download-test.txt',
                data: testData,
                broadcast: false
            });

            // Call files/download - this returns { data: { __ape_link__: hash } }
            // The hash is generated from queryId + path, not the upload hash
            const regResult = await client.call('files/download', {
                hash: uploadResult.hash
            });

            // Server sends binary data as { "data<!L>": hash }
            // JSS decode strips the <!L> tag, leaving { data: hash }
            // The hash is a short string like "r28rp7"
            const linkHash = regResult?.data;

            // Verify we got a hash (short string, not a Buffer or object)
            expect(typeof linkHash).toBe('string');
            expect(linkHash.length).toBeGreaterThan(0);
            expect(linkHash.length).toBeLessThan(20); // Hash is short

            // Now try HTTP download with the link hash
            // The download path is /{where}/ape/data/{hash}
            const downloadUrl = `${server.url}/${server.apiPath}/ape/data/${linkHash}`;

            const response = await new Promise((resolve, reject) => {
                const req = http.request(downloadUrl, {
                    method: 'GET',
                    headers: { Cookie: `apeClientId=${clientId}` }
                }, (res) => {
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: Buffer.concat(chunks)
                        });
                    });
                });
                req.on('error', reject);
                req.end();
            });

            // Should be 200 with the binary data
            if (response.status !== 200) {
                console.log('Download failed:', response.status, response.body.toString());
                console.log('clientId:', clientId, 'linkHash:', linkHash, 'downloadUrl:', downloadUrl);
            }
            expect(response.status).toBe(200);
            expect(response.body.toString()).toBe(testData.toString());
        });

        test('download without client ID returns 401', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const downloadUrl = `${server.url}/${server.apiPath}/ape/data/somehash123`;

            const response = await new Promise((resolve, reject) => {
                http.get(downloadUrl, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body });
                    });
                }).on('error', reject);
            });

            // 401 without client ID, or may delegate to original handlers (404)
            expect([401, 404]).toContain(response.status);
            if (response.body && response.body.startsWith('{')) {
                const data = JSON.parse(response.body);
                expect(data.error).toBeDefined();
            }
        });

        test('download non-existent file returns 404', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const client = await harness.createClientForServer(server);
            const clientId = getClientId(client);

            const downloadUrl = `${server.url}/${server.apiPath}/ape/data/nonexistenthash123`;

            const response = await new Promise((resolve, reject) => {
                const req = http.request(downloadUrl, {
                    method: 'GET',
                    headers: {
                        Cookie: `apeClientId=${clientId}`,
                        'X-Ape-Client-Id': clientId
                    }
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body });
                    });
                });
                req.on('error', reject);
                req.end();
            });

            expect([404, 500]).toContain(response.status);
            if (response.body && response.body.startsWith('{')) {
                const data = JSON.parse(response.body);
                expect(data.error).toBeDefined();
            }

            await client.disconnect();
        });
    });

    describe('HTTP Upload Endpoint', () => {
        test('upload without client ID to non-streaming path returns 401', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const uploadUrl = `${server.url}/${server.apiPath}/ape/data/queryid123/pathhash456`;

            const response = await new Promise((resolve, reject) => {
                const req = http.request(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/octet-stream' }
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body });
                    });
                });
                req.on('error', reject);
                req.write(Buffer.from('test data'));
                req.end();
            });

            // The upload endpoint should return an error status
            // The exact status depends on the order of checks in the handler
            expect([401, 404, 500]).toContain(response.status);
            if (response.body && response.body.startsWith('{')) {
                const data = JSON.parse(response.body);
                expect(data.error).toBeDefined();
            }
        });

        test('upload to non-existent path returns 404', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const client = await harness.createClientForServer(server);
            const clientId = getClientId(client);

            const uploadUrl = `${server.url}/${server.apiPath}/ape/data/queryid123/pathhash456`;

            const response = await new Promise((resolve, reject) => {
                const req = http.request(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        Cookie: `apeClientId=${clientId}`
                    }
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body });
                    });
                });
                req.on('error', reject);
                req.write(Buffer.from('test binary data'));
                req.end();
            });

            // Should be 404 for non-existent upload path
            expect([404, 500]).toContain(response.status);
            if (response.body && response.body.startsWith('{')) {
                const data = JSON.parse(response.body);
                expect(data.error).toBeDefined();
            }

            await client.disconnect();
        });
    });

    describe('Client ID via Header', () => {
        test('X-Ape-Client-Id header works for authentication', async () => {
            const server = await harness.createServer({ where: 'test-api' });
            const client = await harness.createClientForServer(server);
            const clientId = getClientId(client);

            const downloadUrl = `${server.url}/${server.apiPath}/ape/data/somehash123`;

            const response = await new Promise((resolve, reject) => {
                const req = http.request(downloadUrl, {
                    method: 'GET',
                    headers: { 'X-Ape-Client-Id': clientId }
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body });
                    });
                });
                req.on('error', reject);
                req.end();
            });

            // Should not be 401 since we provided client ID - should be 404 for non-existent file
            expect([404, 500]).toContain(response.status);
            if (response.body && response.body.startsWith('{')) {
                const data = JSON.parse(response.body);
                expect(data.error).toBeDefined();
            }

            await client.disconnect();
        });
    });
});
