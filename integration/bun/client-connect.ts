#!/usr/bin/env bun
/**
 * Connection user stories, through the real browser client against a real
 * `Bun.serve` + `apeBun()` server (see scenario-runner.ts for how the two halves run).
 *
 * Usage: bun integration/bun/client-connect.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-connect.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;

const scenarios: Scenario[] = [
    {
        name: 'a page that calls five endpoints before it has connected opens exactly one socket',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, sleep }) => {
            const calls = [1, 2, 3, 4, 5].map((n) => api.hello({ n }));
            const replies = await Promise.all(calls);
            await sleep(400); // any stray extra socket would be open by now
            return replies;
        },
        check: ({ result, ctl }) => {
            assert(result.length === 5 && result.every((r: any, i: number) => r.hello.n === i + 1),
                `the five calls did not all get their own reply: ${JSON.stringify(result)}`);
            assert(ctl.connects === 1, `the server saw ${ctl.connects} sockets for one page, expected 1`);
        },
    },
    {
        name: 'a page that makes a single call before it has connected opens exactly one socket',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, sleep }) => {
            const reply = await api.hello({ n: 1 });
            await sleep(400);
            return reply;
        },
        check: ({ result, ctl }) => {
            assert(result.hello.n === 1, `unexpected reply ${JSON.stringify(result)}`);
            assert(ctl.connects === 1, `the server saw ${ctl.connects} sockets for one page, expected 1`);
        },
    },
    {
        name: 'after the server restarts the page says disconnected, never walled, and is connected again within seconds',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, states, emit, waitForState }) => {
            await api.hello({ first: true });
            await waitForState('connected');
            await emit('server-down'); // the server stops, and is back 2.5 s later
            const began = Date.now();
            let recoveredMs: number | null = null;
            try {
                await waitForState('disconnected', 3000);
                await waitForState('connected', 12000);
                recoveredMs = Date.now() - began;
            } catch { /* recoveredMs stays null */ }
            return { recoveredMs, seen: states.map((s) => s.state) };
        },
        onEvent: { 'server-down': (ctl) => { ctl.stop(); setTimeout(() => ctl.start(), 2500); } },
        timeoutMs: 30000,
        check: ({ result }) => {
            assert(!result.seen.includes('walled'), `the page was told "walled" for a server that was only restarting: ${result.seen.join(' > ')}`);
            assert(result.recoveredMs !== null, `the page never reconnected after the restart: ${result.seen.join(' > ')}`);
            assert(result.recoveredMs < 6000, `the page took ${result.recoveredMs} ms to reconnect, expected under 6000`);
        },
    },
    {
        name: 'a call made while the page is reconnecting after a restart is sent as soon as it is back',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, emit, waitForState }) => {
            await api.hello({ first: true });
            await waitForState('connected');
            await emit('server-down');
            await waitForState('disconnected', 3000);
            // `.then(...)` makes the page wait on the call (and arms its timeout)
            return await new Promise((resolve, reject) => api.hello({ late: true }).then(resolve).catch(reject));
        },
        onEvent: { 'server-down': (ctl) => { ctl.stop(); setTimeout(() => ctl.start(), 2500); } },
        timeoutMs: 30000,
        check: ({ result }) => {
            assert(result?.hello?.late === true, `the call made during the outage got ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a page opened while the server is still starting connects within seconds of it appearing',
        fixtures: { 'hello.js': hello },
        startDown: true,
        browser: async ({ states, emit, waitForState }) => {
            await emit('page-is-trying'); // the server comes up 2.5 s later
            const began = Date.now();
            let connectedMs: number | null = null;
            try { await waitForState('connected', 12000); connectedMs = Date.now() - began; } catch { /* null */ }
            return { connectedMs, seen: states.map((s) => s.state) };
        },
        onEvent: { 'page-is-trying': (ctl) => { setTimeout(() => ctl.start(), 2500); } },
        timeoutMs: 30000,
        check: ({ result }) => {
            assert(!result.seen.includes('walled'), `the page was told "walled" for a server that was not up yet: ${result.seen.join(' > ')}`);
            assert(result.connectedMs !== null, `the page never connected: ${result.seen.join(' > ')}`);
            assert(result.connectedMs < 6000, `the page took ${result.connectedMs} ms to connect once the server was up, expected under 6000`);
        },
    },
    {
        name: 'behind a captive portal (the ping answered by a login page) the page says walled and opens no socket',
        fixtures: { 'hello.js': hello },
        fetch: (req) => new URL(req.url).pathname === '/api/ape/ping'
            ? new Response('<html><body>Please sign in to the hotel WiFi</body></html>', { headers: { 'Content-Type': 'text/html' } })
            : undefined,
        browser: async ({ waitForState, sleep, states }) => {
            await waitForState('walled', 8000);
            await sleep(300);
            return states.map((s) => s.state);
        },
        check: ({ result, ctl }) => {
            assert(result.includes('walled'), `a login page in place of the ping must read as walled: ${result.join(' > ')}`);
            assert(ctl.connects === 0, `the page opened ${ctl.connects} socket(s) behind the portal`);
        },
    },
];

await runScenarios(import.meta.path, 'Connecting (browser client)', scenarios);
