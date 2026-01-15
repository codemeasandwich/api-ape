#!/usr/bin/env bun
/**
 * Bun Integration Tests
 *
 * Tests api-ape running in Bun environment using Bun.serve() native API.
 */

import { resolve, relative } from 'path';

// Import api-ape's Bun-specific module
const bunPath = resolve(import.meta.dir, '../../server/lib/bun.js');
const { apeBun } = await import(bunPath);

// @ts-ignore - CommonJS modules
const { scenarios } = await import('../shared/scenarios.js');
const { runScenarios } = await import('../shared/test-runner.js');

const PORT = 9101;

async function main() {
    console.log(`Bun version: ${Bun.version}`);

    const testApiPath = resolve(import.meta.dir, '../test-api');
    const relPath = relative(process.cwd(), testApiPath);

    // Use Bun-native api-ape integration
    const ape = apeBun({
        where: relPath,
        onConnect: (socket: any, req: any, send: any) => {
            return { embed: { testMode: true, runtime: 'bun' } };
        }
    });

    // Create Bun native server
    const server = Bun.serve({
        port: PORT,
        fetch: ape.fetch,
        websocket: ape.websocket
    });

    console.log(`Server listening on port ${PORT}`);

    // Run tests - Bun has native WebSocket
    const { passed, failed } = await runScenarios({
        runtime: `Bun ${Bun.version}`,
        server: { port: PORT, apiPath: relPath },
        WebSocket,
        Buffer,
        scenarios
    });

    // Cleanup
    server.stop();

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
