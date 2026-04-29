#!/usr/bin/env node
/**
 * @fileoverview Express integration harness — verifies api-ape mounted alongside customary Express routes
 *
 * Spawns `/health`, JSON APIs, attaches `ape` on a shared HTTP server, then runs shared WebSocket RPC scenarios from `integration/shared/scenarios`.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// Import api-ape from parent directory
const { ape } = require('../../server');

const { scenarios } = require('../shared/scenarios');
const { runScenarios } = require('../shared/test-runner');

const PORT = 9103;

/**
 * Builds Express app, attaches api-ape, listens, executes scenarios, then exits.
 *
 * @returns {Promise<void>}
 */
async function main() {
    console.log(`Express integration test`);
    console.log(`Node.js version: ${process.version}`);

    // Reset singleton state for fresh test
    if (ape._serverApe && ape._serverApe._resetForTesting) {
        ape._serverApe._resetForTesting();
    }

    // Create Express app
    const app = express();

    // Add some Express middleware/routes
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', runtime: 'express' });
    });

    app.get('/api/info', (req, res) => {
        res.json({
            framework: 'express',
            version: require('express/package.json').version
        });
    });

    // Create HTTP server from Express app
    const httpServer = http.createServer(app);

    // Initialize api-ape on the same server
    // When run from integration folder: node express/test.js
    // When run from project root: node integration/express/test.js
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
                        framework: 'express'
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

    // Test Express routes work alongside api-ape
    console.log('\nTesting Express routes coexistence...');

    const fetch = globalThis.fetch || (await import('node-fetch')).default;

    try {
        const healthRes = await fetch(`http://localhost:${PORT}/health`);
        const health = await healthRes.json();
        if (health.status === 'ok') {
            console.log('  OK Express /health route works');
        } else {
            console.log('  FAIL Express /health route failed');
        }
    } catch (err) {
        console.log(`  FAIL Express routes error: ${err.message}`);
    }

    // Run WebSocket tests
    const { passed, failed } = await runScenarios({
        runtime: `Express + Node.js ${process.version}`,
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
