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

    // TypeScript controllers through the `selector` option
    const selectorFailed = await checkSelector();

    // Exit with appropriate code
    process.exit(failed > 0 || selectorFailed ? 1 : 0);
}

/**
 * Call one controller over a fresh WebSocket and resolve with the reply frame.
 *
 * @param {number} port - Server port
 * @param {string} apiPath - URL prefix of the api-ape routes
 * @param {string} type - Controller name
 * @returns {Promise<any>} The reply frame for this call (data or error)
 */
async function callOnce(port: number, apiPath: string, type: string): Promise<any> {
    const { messageHash } = await import('../shared/scenarios.js');
    const ws = new WebSocket(`ws://localhost:${port}/${apiPath}/ape`);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const message = JSON.stringify({ type, data: { message: 'hello' } });
    const queryId = messageHash(message);
    try {
        return await new Promise((resolve, reject) => {
            ws.onmessage = (event) => {
                const frame = JSON.parse(event.data);
                if (frame.queryId === queryId) resolve(frame);
            };
            ws.onerror = reject;
            ws.send(message);
            setTimeout(() => reject(new Error(`${type} call timed out`)), 5000);
        });
    } finally {
        ws.close(1000);
    }
}

/**
 * The `selector` option: with `['js','ts']` a `.ts` controller answers; with
 * the default selector the same folder registers no `.ts` controller.
 *
 * @returns {Promise<boolean>} true when a check failed
 */
async function checkSelector(): Promise<boolean> {
    const tsPath = relative(process.cwd(), resolve(import.meta.dir, '../test-api-ts'));
    let failed = false;
    for (const [selector, expectTs] of [[['js', 'ts'], true], [undefined, false]] as const) {
        const ape = apeBun({ where: tsPath, selector: selector as any });
        const server = Bun.serve({ port: PORT + 1, fetch: ape.fetch, websocket: ape.websocket });
        try {
            const frame = await callOnce(PORT + 1, tsPath, 'tsEcho');
            const answered = frame?.data?.runtime === 'ts';
            const label = selector ? `selector ${JSON.stringify(selector)}` : 'default selector';
            if (answered === expectTs) {
                console.log(`  ✓ ${label}: .ts controller ${expectTs ? 'registered' : 'ignored'}`);
            } else {
                console.log(`  ✗ ${label}: expected the .ts controller to be ${expectTs ? 'registered' : 'ignored'}, got ${JSON.stringify(frame)}`);
                failed = true;
            }
        } catch (err) {
            console.log(`  ✗ selector check failed: ${(err as Error).message}`);
            failed = true;
        } finally {
            server.stop(true);
        }
    }
    return failed;
}

main().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
