#!/usr/bin/env bun
/**
 * Calls that land while the page is retrying, through the real browser client against a
 * real `Bun.serve` + `apeBun()` server.
 *
 * A server restart leaves the page pinging with backoff (0.5 s up to 30 s). Calls made
 * meanwhile used to (a) each ping again, bypassing the backoff (about 90 pings in 10 s at
 * one call per 37 ms), and (b) sometimes land between a failed ping and its scheduled
 * retry, so the call opened a socket and the retry then opened another: three onConnects
 * for one page, every broadcast twice, and the orphan's close marking the live socket
 * not ready.
 *
 * Usage: bun integration/bun/client-race.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-race.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;

/** Count the pings this page sends (what a server operator would see as /api/ape/ping hits). */
const countPings = () => {
    const counter = { pings: 0 };
    const nativeFetch = globalThis.fetch;
    (globalThis as any).fetch = (input: any, init?: any) => {
        if (String(input?.url ?? input).includes('/ape/ping')) counter.pings++;
        return nativeFetch(input, init);
    };
    return counter;
};

const outage = (downMs: number) => ({
    'server-down': (ctl: any) => { ctl.stop(); setTimeout(() => ctl.start(), downMs); },
});

/** A page that calls every `everyMs` for `forMs` while the server is down for 2.5 s, then a push. */
const oneSocket = (everyMs: number): Scenario => {
    // A channel of its own: the server replays a channel's last message to every new subscriber,
    // and the publish registry is shared by the scenarios of this run.
    const channel = `race${everyMs}`;
    return {
    name: `a page that makes a call every ${everyMs} ms through a 2.5 s outage reconnects with one socket and hears each broadcast once`,
    fixtures: { 'hello.js': hello },
    browser: async ({ api, emit, waitForState, sleep }) => {
        const heard: any[] = [];
        api[channel].banking((data: any) => heard.push(data));
        await api.hello({ first: true });
        await waitForState('connected');
        await emit('server-down');
        await waitForState('disconnected', 3000);
        const outcomes: string[] = [];
        const until = Date.now() + 5000;
        for (let n = 0; Date.now() < until; n++) {
            api.hello({ n }).then(() => outcomes.push('ok'), (e: any) => outcomes.push(e.message));
            await sleep(everyMs);
        }
        await sleep(1500);
        await waitForState('connected', 15000);
        await sleep(300);
        await emit('publish');
        await sleep(500);
        return { heard, calls: outcomes.length };
    },
    onEvent: { ...outage(2500), publish: (ctl) => ctl.publish(`/${channel}/banking`, { n: 1 }) },
    timeoutMs: 45000,
    check: ({ result, ctl, errors }) => {
        assert(ctl.connects === 2, `the server saw ${ctl.connects} onConnects for one page that lost its server once, expected 2`);
        assert(result.heard.length === 1, `the page heard one broadcast ${result.heard.length} times (a second socket subscribes too)`);
        assert(errors.length === 0, `the page suffered ${errors.join('; ')}`);
    },
    };
};

const scenarios: Scenario[] = [
    {
        name: 'a page that makes a call every 40 ms through a 3 s outage pings a handful of times and every call succeeds once the server is back',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, emit, waitForState, sleep }) => {
            const counter = countPings();
            await api.hello({ first: true });
            await waitForState('connected');
            await emit('server-down');
            await waitForState('disconnected', 3000);
            const before = counter.pings;
            const calls: Promise<string>[] = [];
            const until = Date.now() + 3000;
            for (let n = 0; Date.now() < until; n++) {
                calls.push(api.hello({ n }).then(() => 'ok', (e: any) => e.message));
                await sleep(40);
            }
            const outcomes = await Promise.all(calls);
            return { pings: counter.pings - before, calls: outcomes.length, failed: outcomes.filter((o) => o !== 'ok') };
        },
        onEvent: outage(3000),
        timeoutMs: 30000,
        check: ({ result }) => {
            assert(result.calls > 50, `the page only made ${result.calls} calls`);
            assert(result.pings <= 8, `${result.calls} calls during the outage caused ${result.pings} pings, expected a handful (the backoff is 0.5 s up to 30 s)`);
            assert(result.failed.length === 0, `${result.failed.length} calls failed after the server returned: ${result.failed.slice(0, 2).join(' | ')}`);
        },
    },
    oneSocket(100),
    oneSocket(250),
    oneSocket(400),
];

await runScenarios(import.meta.path, 'Calls while retrying (browser client)', scenarios);
