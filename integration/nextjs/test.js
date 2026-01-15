#!/usr/bin/env node
/**
 * Next.js Integration Tests
 *
 * Tests api-ape integrated with Next.js custom server.
 * Next.js can use a custom server for WebSocket support.
 */

const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// Import api-ape from parent directory
const { ape } = require('../../server');

const { scenarios } = require('../shared/scenarios');
const { runScenarios } = require('../shared/test-runner');

const PORT = 9104;

async function main() {
    console.log(`Next.js integration test`);
    console.log(`Node.js version: ${process.version}`);

    // Reset singleton state for fresh test
    if (ape._serverApe && ape._serverApe._resetForTesting) {
        ape._serverApe._resetForTesting();
    }

    // In a real Next.js app, you'd use next() to create the app
    // For testing, we just need to verify api-ape works with custom server pattern
    // that Next.js uses: http.createServer + upgrade handling

    // Create HTTP server (simulates Next.js custom server pattern)
    const httpServer = http.createServer((req, res) => {
        // In real app: app.getRequestHandler()(req, res)
        if (req.url === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', framework: 'nextjs' }));
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
    });

    // Initialize api-ape on the same server
    // When run from integration folder: node nextjs/test.js
    const testApiPath = path.resolve(__dirname, '../test-api');
    const relPath = path.relative(process.cwd(), testApiPath);
    console.log(`API path: ${relPath}`);

    try {
        ape(httpServer, {
            where: relPath,
            onConnect: (socket, req, send) => {
                return {
                    embed: {
                        testMode: true,
                        framework: 'nextjs'
                    }
                };
            }
        });
    } catch (err) {
        console.log('Note: api-ape singleton reused');
    }

    // Start server
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(PORT, () => {
            httpServer.removeListener('error', reject);
            resolve();
        });
    });

    console.log(`Server listening on port ${PORT}`);

    // Test custom server routes work alongside api-ape
    console.log('\nTesting Next.js custom server routes coexistence...');

    const fetch = globalThis.fetch || (await import('node-fetch')).default;

    try {
        const healthRes = await fetch(`http://localhost:${PORT}/api/health`);
        const health = await healthRes.json();
        if (health.status === 'ok') {
            console.log('  ✓ Custom /api/health route works');
        } else {
            console.log('  ✗ Custom /api/health route failed');
        }
    } catch (err) {
        console.log(`  ✗ Custom routes error: ${err.message}`);
    }

    // Run WebSocket tests
    const { passed, failed } = await runScenarios({
        runtime: `Next.js custom server + Node.js ${process.version}`,
        server: { port: PORT, apiPath: relPath },
        WebSocket,
        Buffer,
        scenarios
    });

    // Cleanup
    httpServer.close();

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
