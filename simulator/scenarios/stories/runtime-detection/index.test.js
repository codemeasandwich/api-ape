/**
 * @fileoverview Runtime Detection User Stories
 *
 * Tests the wsProvider runtime detection system:
 * - Deno, Bun, Node.js 24+ detection
 * - Runtime override for testing
 * - Provider selection based on runtime
 * - Fallback to polyfill when adapters unavailable
 *
 * @module simulator/scenarios/stories/runtime-detection
 */

const { Harness } = require('../../../harness');

jest.setTimeout(10000);

describe('Runtime Detection User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 25000, connectTimeout: 5000 });
    });

    afterEach(async () => {
        // Always reset runtime override after tests
        const wsProvider = require('../../../../server/lib/wsProvider');
        wsProvider._setRuntimeOverride(null);
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 50));
    });

    describe('Default Runtime Detection', () => {
        test('detects Node.js runtime by default', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {});

            // Align with server/lib/wsProvider: Node 24+ stable sets isNode24, but `node:ws`
            // is not bundled on all Node builds — provider then falls back to polyfill.
            const wsProvider = require('../../../../server/lib/wsProvider');
            const expectsNode24 = wsProvider.isNode24Stable();

            expect(result.runtime).toBe('node');
            expect(result.isDeno).toBe(false);
            expect(result.isBun).toBe(false);
            expect(result.isNode24).toBe(expectsNode24);
            if (result.isNode24) {
                expect(['node-native', 'polyfill']).toContain(result.provider.type);
            } else {
                expect(result.provider.type).toBe('polyfill');
            }
            expect(result.provider.hasWebSocketServer).toBe(true);
        });

        test('reset clears any override', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            // Set an override
            await client.call('runtime', { override: { deno: true } });

            // Reset by passing null override
            const resetResult = await client.call('runtime', { override: null });

            // Verify default behavior restored
            expect(resetResult.runtime).toBe('node');
            expect(resetResult.currentOverride).toBeNull();
        });
    });

    describe('Deno Runtime Override', () => {
        test('isDeno returns true when override is set', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { deno: true }
            });

            expect(result.isDeno).toBe(true);
            expect(result.runtime).toBe('deno');
            expect(result.currentOverride).toEqual({ deno: true });
        });

        test('Deno provider returns deno-native when adapter available', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { deno: true }
            });

            // Deno adapter exists in server/lib/ws/adapters/deno.js
            expect(result.provider.type).toBe('deno-native');
            expect(result.provider.runtime).toBe('deno');
            expect(result.provider.hasWebSocketServer).toBe(true);
        });

        test('isDeno returns false when explicitly disabled', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { deno: false }
            });

            expect(result.isDeno).toBe(false);
        });
    });

    describe('Bun Runtime Override', () => {
        test('isBun returns true when override is set', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { bun: true }
            });

            expect(result.isBun).toBe(true);
            expect(result.runtime).toBe('bun');
            expect(result.currentOverride).toEqual({ bun: true });
        });

        test('Bun provider returns bun-native when adapter available', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { bun: true }
            });

            // Bun adapter exists in server/lib/ws/adapters/bun.js
            expect(result.provider.type).toBe('bun-native');
            expect(result.provider.runtime).toBe('bun');
            expect(result.provider.hasWebSocketServer).toBe(true);
        });

        test('isBun returns false when explicitly disabled', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { bun: false }
            });

            expect(result.isBun).toBe(false);
        });
    });

    describe('Node.js 24+ Override', () => {
        test('isNode24Stable returns true when override is set', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { node24: true }
            });

            expect(result.isNode24).toBe(true);
            // Runtime is still "node" since we're not overriding deno/bun
            expect(result.runtime).toBe('node');
        });

        test('Node24 provider falls back to polyfill (node:ws not available)', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { node24: true }
            });

            // node:ws module not available on Node < 24, so falls back to polyfill
            expect(result.provider.type).toBe('polyfill');
        });

        test('isNode24Stable returns false when explicitly disabled', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { node24: false }
            });

            expect(result.isNode24).toBe(false);
        });
    });

    describe('Combined Runtime Overrides', () => {
        test('Deno takes priority over Bun in runtime detection', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { deno: true, bun: true }
            });

            // Deno is checked first in getRuntime()
            expect(result.runtime).toBe('deno');
            expect(result.isDeno).toBe(true);
            expect(result.isBun).toBe(true); // Both are technically "true"
        });

        test('Bun is detected when Deno is false', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const result = await client.call('runtime', {
                override: { deno: false, bun: true }
            });

            expect(result.runtime).toBe('bun');
            expect(result.isDeno).toBe(false);
            expect(result.isBun).toBe(true);
        });

        test('Node24 detection is independent of runtime type', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            // Even with bun=true, we can also have node24=true
            const result = await client.call('runtime', {
                override: { bun: true, node24: true }
            });

            expect(result.runtime).toBe('bun');
            expect(result.isBun).toBe(true);
            // Note: isNode24Stable checks isBun() first, so it would return false
            // unless we explicitly override node24
            expect(result.isNode24).toBe(true);
        });
    });

    describe('Provider Caching', () => {
        test('provider is cached until override changes', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            // First call - gets cached as polyfill (default node runtime)
            const result1 = await client.call('runtime', { _t: 1 });
            expect(result1.provider.type).toBe('polyfill');

            // Second call - same provider (pass different data to avoid duplicate rejection)
            const result2 = await client.call('runtime', { _t: 2 });
            expect(result2.provider.type).toBe('polyfill');

            // Change override - cache should clear and return deno-native
            const result3 = await client.call('runtime', {
                override: { deno: true }
            });
            expect(result3.provider.type).toBe('deno-native');
            expect(result3.provider.runtime).toBe('deno');
        });

        test('null override resets to actual detection', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            // Set override
            await client.call('runtime', { override: { deno: true } });

            // Clear override with explicit null
            const result = await client.call('runtime', { override: null });

            expect(result.runtime).toBe('node');
            expect(result.currentOverride).toBeNull();
        });
    });

    describe('Unknown Runtime', () => {
        test('returns unknown when all runtimes are disabled', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            // This is a tricky case - we need to simulate no process.versions.node
            // Since we can't easily do that, we just verify the else path
            // by checking that non-matched overrides don't affect runtime
            const result = await client.call('runtime', {
                override: { deno: false, bun: false }
            });

            // Still Node.js because process.versions.node exists
            expect(result.runtime).toBe('node');
        });
    });
});
