#!/usr/bin/env node
/**
 * Node.js Integration Tests
 *
 * Tests api-ape running in Node.js environment.
 */

const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// Import api-ape from parent directory
const apiApePath = path.resolve(__dirname, '../../server');
const serverModule = require(apiApePath);
const { ape } = serverModule;

const { scenarios } = require('../shared/scenarios');
const { runScenarios } = require('../shared/test-runner');

const PORT = 9100;
const API_PATH = 'integration/test-api';

async function main() {
    console.log(`Node.js version: ${process.version}`);

    // Reset singleton state for fresh test
    if (ape._serverApe && ape._serverApe._resetForTesting) {
        ape._serverApe._resetForTesting();
    }

    // Create HTTP server
    const httpServer = http.createServer((req, res) => {
        res.writeHead(404);
        res.end('Not Found');
    });

    // Initialize api-ape with test controllers
    const testApiPath = path.resolve(__dirname, '../test-api');
    const relPath = path.relative(process.cwd(), testApiPath);

    ape(httpServer, {
        where: relPath,
        onConnect: (socket, req, send) => {
            return { embed: { testMode: true } };
        }
    });

    // Start server
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(PORT, () => {
            httpServer.removeListener('error', reject);
            resolve();
        });
    });

    console.log(`Server listening on port ${PORT}`);

    // Run tests
    const { passed, failed } = await runScenarios({
        runtime: `Node.js ${process.version}`,
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
