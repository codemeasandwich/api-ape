/**
 * @fileoverview HTTP Utilities User Stories
 *
 * Tests HTTP utility functionality including:
 * - Client bundle serving (ape.js)
 * - Source map serving (ape.js.map)
 * - Route matching with parameters
 * - Cookie parsing
 * - Security checks (localhost, HTTPS)
 *
 * @module simulator/scenarios/stories/http-utilities
 */

const http = require('http');
const { Harness } = require('../../../harness');

jest.setTimeout(15000);

describe('HTTP Utilities User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 17000, connectTimeout: 5000 });
    });

    afterEach(async () => {
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 50));
    });

    describe('Client Bundle Serving', () => {
        test('server handles request for client JavaScript bundle', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            // The bundle path is /{where}/ape.js
            const bundleUrl = `${server.url}/${server.apiPath}/ape.js`;

            const response = await new Promise((resolve, reject) => {
                http.get(bundleUrl, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
                }).on('error', reject);
            });

            // Bundle may or may not exist in test environment
            // 200 if exists, 500 if not (serveClientBundle returns 500 on error)
            expect([200, 500]).toContain(response.status);
            if (response.status === 200) {
                expect(response.headers['content-type']).toBe('application/javascript');
                expect(response.body.length).toBeGreaterThan(100);
            } else {
                // Error response should be JSON
                expect(response.headers['content-type']).toBe('application/json');
            }
        });

        test('server handles request for source map', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const mapUrl = `${server.url}/${server.apiPath}/ape.js.map`;

            const response = await new Promise((resolve, reject) => {
                http.get(mapUrl, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
                }).on('error', reject);
            });

            // Source map may or may not exist
            // 200 if exists, 404 if not (serveSourceMap returns 404 on error)
            expect([200, 404]).toContain(response.status);
            expect(response.headers['content-type']).toBe('application/json');
        });
    });

    describe('Ping Endpoint', () => {
        test('server responds to ping requests', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const pingUrl = `${server.url}/${server.apiPath}/ape/ping`;

            const response = await new Promise((resolve, reject) => {
                http.get(pingUrl, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                }).on('error', reject);
            });

            expect(response.status).toBe(200);
            // Ping returns JSON with ok and timestamp
            const data = JSON.parse(response.body);
            expect(data.ok).toBe(true);
            expect(data.ts).toBeDefined();
        });
    });

    describe('Cookie Handling', () => {
        test('server sets client ID cookie on polling connection', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const pollUrl = `${server.url}/${server.apiPath}/ape/poll`;

            const response = await new Promise((resolve, reject) => {
                http.get(pollUrl, (res) => {
                    // Just need headers, don't need full body
                    resolve({ status: res.statusCode, headers: res.headers });
                    res.destroy(); // Close the streaming connection
                }).on('error', reject);
            });

            expect(response.status).toBe(200);
            expect(response.headers['set-cookie']).toBeDefined();
            expect(response.headers['set-cookie'][0]).toContain('apeClientId=');
        });

        test('server uses existing client ID cookie on subsequent requests', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            const pollUrl = `${server.url}/${server.apiPath}/ape/poll`;
            const existingClientId = 'TESTCLIENT123456789X';

            const response = await new Promise((resolve, reject) => {
                const req = http.request(pollUrl, {
                    method: 'GET',
                    headers: { Cookie: `apeClientId=${existingClientId}` }
                }, (res) => {
                    resolve({ status: res.statusCode, headers: res.headers });
                    res.destroy();
                });
                req.on('error', reject);
                req.end();
            });

            expect(response.status).toBe(200);
            // Should NOT set a new cookie since we provided one
            const setCookie = response.headers['set-cookie'];
            expect(setCookie).toBeUndefined();
        });
    });

    describe('Security Checks', () => {
        test('localhost connections are allowed without HTTPS', async () => {
            const server = await harness.createServer({ where: 'test-api' });

            // Connect via localhost (which our harness does)
            const client = await harness.createClientForServer(server);

            // Should be able to make calls
            const result = await client.call('echo', { test: true });
            expect(result.test).toBe(true);

            await client.disconnect();
        });
    });
});
