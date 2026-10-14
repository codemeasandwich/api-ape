#!/usr/bin/env bun
/**
 * Keepalive user stories, through the real browser client against a real
 * `Bun.serve` + `apeBun()` server (see scenario-runner.ts for how the two halves run).
 *
 * A controller that needs longer than the client's 10 s window calls
 * `this.keepalive()` every few seconds. The page must see ONE result, the real
 * one, and a second long call running at the same time must not disturb it.
 *
 * Usage: bun integration/bun/client-keepalive.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-keepalive.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

/** A controller that works for `n` rounds of `ms`, sending a keepalive after each round. */
const slow = `module.exports = async function ({ n, ms, tag }) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, ms));
    this.keepalive();
  }
  return { done: true, tag, rounds: n };
};`;

const scenarios: Scenario[] = [
    {
        name: 'a page awaiting a slow call gets the real result, not undefined from the first keepalive',
        fixtures: { 'slow.js': slow },
        browser: ({ api }) => api.slow({ n: 4, ms: 250, tag: 'solo' }),
        check: ({ result }) => {
            assert(result !== undefined, 'the call resolved with undefined: a keepalive frame was taken for the reply');
            assert(result.done === true && result.tag === 'solo', `unexpected result ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a call that outlives the 10 s timeout stays alive because each keepalive restarts the timer',
        fixtures: { 'slow.js': slow },
        // `.then(...)` arms the call's timeout on 4.3.0 (a bare `await` did not until 4.4.0),
        // so this story is meaningful on old and new clients alike.
        browser: ({ api }) => new Promise((resolve, reject) => api.slow({ n: 4, ms: 3000, tag: 'long' }).then(resolve).catch(reject)),
        timeoutMs: 30000,
        check: ({ result }) => {
            assert(result?.done === true && result.rounds === 4, `the 12 s call did not finish: ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'two slow calls running at once each get their own result',
        fixtures: { 'slow.js': slow },
        browser: async ({ api, sleep }) => {
            const a = api.slow({ n: 3, ms: 300, tag: 'A' });
            await sleep(100);
            const b = api.slow({ n: 2, ms: 300, tag: 'B' });
            return { a: await a, b: await b };
        },
        check: ({ result }) => {
            assert(result.a?.tag === 'A' && result.a.rounds === 3, `call A got ${JSON.stringify(result.a)}`);
            assert(result.b?.tag === 'B' && result.b.rounds === 2, `call B got ${JSON.stringify(result.b)}`);
        },
    },
];

await runScenarios(import.meta.path, 'Keepalive (browser client)', scenarios);
