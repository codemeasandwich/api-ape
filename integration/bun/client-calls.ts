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
const voidret = `module.exports = function () { /* returns nothing */ };`;
const voidAsync = `module.exports = async function () { await new Promise((r) => setTimeout(r, 20)); };`;
const never = `module.exports = function () { return new Promise(() => {}); };`;
const fail = `module.exports = function () { throw new Error('nope'); };`;

/** Make the page connected, so the next call takes the direct path (no start-up buffering). */
async function warmUp(b: { api: any; waitForState: (s: string) => Promise<number> }) {
    await b.api.hello({ warm: true });
    await b.waitForState('connected');
}

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
    {
        name: 'a page that awaits a controller that returns nothing gets undefined instead of hanging',
        fixtures: { 'hello.js': hello, 'voidret.js': voidret, 'voidAsync.js': voidAsync },
        browser: async ({ api, waitForState }) => {
            await warmUp({ api, waitForState });
            const guard = (p: Promise<any>) => Promise.race([p, new Promise((r) => setTimeout(() => r('NO REPLY'), 3000))]);
            return { sync: await guard(api.voidret({})), async: await guard(api.voidAsync({})) };
        },
        check: ({ result }) => {
            assert(result.sync === undefined, `a controller that returns nothing: page got ${JSON.stringify(result.sync)} (expected undefined)`);
            assert(result.async === undefined, `an async controller that returns nothing: page got ${JSON.stringify(result.async)} (expected undefined)`);
        },
    },
    {
        name: 'a page that awaits a call the server never answers gets a timeout error after 10 s, not a hang',
        fixtures: { 'hello.js': hello, 'never.js': never },
        browser: async ({ api, waitForState }) => {
            await warmUp({ api, waitForState });
            const began = Date.now();
            try { await api.never({}); return { ok: true }; }
            catch (e: any) { return { message: String(e?.message ?? e), ms: Date.now() - began }; }
        },
        timeoutMs: 20000,
        check: ({ result }) => {
            assert(result.message?.includes('Timed out'), `expected a timeout error, got ${JSON.stringify(result)}`);
            assert(result.ms >= 9000 && result.ms < 12000, `timed out after ${result.ms} ms, expected about 10000`);
        },
    },
    {
        name: 'a page that passes an error handler as the second argument of then() receives the error there',
        fixtures: { 'hello.js': hello, 'fail.js': fail },
        browser: async ({ api, waitForState }) => {
            await warmUp({ api, waitForState });
            return new Promise((resolve) => {
            api.fail({}).then(() => resolve('resolved'), (e: any) => resolve({ rejectedWith: String(e?.message ?? e) }));
            setTimeout(() => resolve('NO ANSWER'), 4000);
            });
        },
        check: ({ result }) => {
            assert(result?.rejectedWith?.includes('nope'), `the error handler was not called with the error: ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a page that fires a call that fails and never looks at the result keeps running',
        fixtures: { 'hello.js': hello, 'fail.js': fail },
        browser: async ({ api, waitForState, sleep }) => {
            await warmUp({ api, waitForState });
            api.fail({}); // fire and forget
            await sleep(600);
            return 'still alive';
        },
        check: ({ result, errors }) => {
            assert(result === 'still alive', `the page did not survive an unhandled failed call: ${JSON.stringify(result)}`);
            assert(errors.length === 0, `a call nobody looked at raised: ${errors.join('; ')}`);
        },
    },
    {
        name: 'a page that makes a call while the server is down and ignores it keeps running when the call expires',
        fixtures: { 'hello.js': hello },
        startDown: true,
        browser: async ({ connectSocket, sleep }) => {
            connectSocket().sender.hello({}); // queued, never awaited, expires after 5 s
            await sleep(6500);
            return 'still alive';
        },
        timeoutMs: 20000,
        check: ({ result, errors }) => {
            assert(result === 'still alive', `the page crashed when an ignored queued call expired: ${JSON.stringify(result)}`);
            assert(errors.length === 0, `an ignored queued call raised when it expired: ${errors.join('; ')}`);
        },
    },
];

await runScenarios(import.meta.path, 'Calls (browser client)', scenarios);
