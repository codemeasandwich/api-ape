#!/usr/bin/env bun
/**
 * Call user stories, through the real browser client against a real
 * `Bun.serve` + `apeBun()` server (see scenario-runner.ts for how the two halves run).
 *
 * Usage: bun integration/bun/client-calls.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-calls.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;

const scenarios: Scenario[] = [
    {
        name: 'a page that makes the same call five times in the same millisecond gets five replies',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, waitForState }) => {
            await api.hello({ warm: true });
            await waitForState('connected');
            // Identical payloads, one tick: React StrictMode's double effect does exactly this.
            const replies = await Promise.all([1, 2, 3, 4, 5].map(() => api.hello({ same: 'payload' })));
            return replies;
        },
        timeoutMs: 15000,
        check: ({ result }) => {
            assert(Array.isArray(result) && result.length === 5, `expected five replies, got ${JSON.stringify(result)}`);
            assert(result.every((r: any) => r?.hello?.same === 'payload'), `a call was refused or lost: ${JSON.stringify(result)}`);
        },
    },
];

await runScenarios(import.meta.path, 'Calls (browser client)', scenarios);
