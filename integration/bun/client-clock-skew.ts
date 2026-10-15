#!/usr/bin/env bun
/**
 * Clock skew (4.5.1), through the real browser client against a real `apeBun()` server on
 * `Bun.serve`. (`ape()` on Node is covered by the Jest stories in
 * `simulator/scenarios/stories/call-contract/clock-skew.test.js`.)
 *
 * Before 4.5.1 the server refused a call whose `createdAt` was even 1 ms ahead of its own
 * clock, so a page whose clock ran a little fast had every call refused. Now the server sends
 * its time in the `__connected__` frame, the client stamps calls in the server's clock, and
 * the server tolerates `maxClockSkewMs` (default 5000) of lead.
 *
 * A page's clock is skewed by replacing `Date.now` (what the client stamps with). An "older
 * server" is simulated by removing `serverTime` from the greeting the page receives.
 *
 * Usage: bun integration/bun/client-clock-skew.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-clock-skew.ts   (fails there)
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;

/** This page's clock now runs `ms` ahead of the server's (negative: behind). */
function skewPageClock(ms: number) {
    const real = Date.now.bind(Date);
    Date.now = () => real() + ms;
}

/** What an older server's greeting looks like to the page: no `serverTime`. */
function hideServerTime() {
    const proto = (globalThis as any).WebSocket.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage')!;
    Object.defineProperty(proto, 'onmessage', {
        configurable: true,
        get() { return descriptor.get!.call(this); },
        set(handler: any) {
            descriptor.set!.call(this, handler && ((event: any) => handler({ data: String(event.data).replace(/,?"serverTime":\d+/, '') })));
        },
    });
}

/** The page's outcome of one call: what it resolved with, or the rejection's message. */
async function outcome(call: Promise<any>) {
    return call.then(
        (value) => ({ resolved: value }),
        (err: any) => ({ rejected: String(err?.message ?? err) }),
    );
}

/** The scenarios, against `apeBun()` (`ape()` on Node is covered by the Jest stories: Node-under-Bun cannot upgrade a WebSocket). */
function forServer(server: 'bun'): Scenario[] {
    const on = '(apeBun)';
    return [
        {
            name: `a page whose clock is 30 s fast gets its answers, the first call (made before connecting) and the next ${on}`,
            fixtures: { 'hello.js': hello },
            server,
            browser: async ({ api }) => {
                skewPageClock(30000); // the captive-portal ping check allows 60 s; beyond that a page never connects
                const first = await outcome(api.hello({ n: 1 }));
                const second = await outcome(api.hello({ n: 2 }));
                return { first, second };
            },
            timeoutMs: 20000,
            check: ({ result }) => {
                assert(result.first.resolved?.hello?.n === 1, `first call: ${JSON.stringify(result.first)}`);
                assert(result.second.resolved?.hello?.n === 2, `second call: ${JSON.stringify(result.second)}`);
            },
        },
        {
            name: `a page whose clock is 30 s slow gets its answers, not "request is old" ${on}`,
            fixtures: { 'hello.js': hello },
            server,
            browser: async ({ api }) => {
                skewPageClock(-30000);
                return { first: await outcome(api.hello({ n: 1 })), second: await outcome(api.hello({ n: 2 })) };
            },
            timeoutMs: 20000,
            check: ({ result }) => {
                assert(result.first.resolved?.hello?.n === 1, `first call: ${JSON.stringify(result.first)}`);
                assert(result.second.resolved?.hello?.n === 2, `second call: ${JSON.stringify(result.second)}`);
            },
        },
        {
            name: `an older server (no serverTime): a page a few seconds fast is still answered, one a minute fast is refused as a rejected promise with the server's message ${on}`,
            fixtures: { 'hello.js': hello },
            server,
            browser: async ({ api, waitForState }) => {
                hideServerTime();
                skewPageClock(3000);
                const near = await outcome(api.hello({ n: 1 }));
                await waitForState('connected');
                skewPageClock(57000); // now a minute ahead in all
                const far = await outcome(api.hello({ n: 2 }));
                return { near, far };
            },
            timeoutMs: 20000,
            check: ({ result }) => {
                assert(result.near.resolved?.hello?.n === 1, `a page 3 s fast was not answered: ${JSON.stringify(result.near)}`);
                assert('rejected' in result.far, `a page a minute fast should be refused, got ${JSON.stringify(result.far)}`);
                assert(/createdAt ahead of server by/.test(result.far.rejected), `the rejection should carry the server's message: ${result.far.rejected}`);
                assert(result.far.rejected.includes('maxClockSkewMs'), `the message should name the option: ${result.far.rejected}`);
            },
        },
        {
            name: `maxClockSkewMs: 20 s accepts a page 15 s ahead and refuses one 30 s ahead (older server, so the page cannot correct) ${on}`,
            fixtures: { 'hello.js': hello },
            apeOptions: { maxClockSkewMs: 20000 },
            server,
            browser: async ({ api, waitForState }) => {
                hideServerTime();
                skewPageClock(15000);
                const within = await outcome(api.hello({ n: 1 }));
                await waitForState('connected');
                skewPageClock(15000); // 30 s in all
                const beyond = await outcome(api.hello({ n: 2 }));
                return { within, beyond };
            },
            timeoutMs: 20000,
            check: ({ result }) => {
                assert(result.within.resolved?.hello?.n === 1, `15 s ahead with a 20 s tolerance: ${JSON.stringify(result.within)}`);
                assert(/accepts up to 20 secs/.test(result.beyond.rejected ?? ''), `30 s ahead should be refused naming the 20 s: ${JSON.stringify(result.beyond)}`);
            },
        },
    ];
}

const scenarios: Scenario[] = [
    ...forServer('bun'),
    {
        name: 'a server that sends no greeting at all does not stall a call made before connecting (it goes out within about a second)',
        fixtures: { 'hello.js': hello },
        browser: async ({ api }) => {
            const proto = (globalThis as any).WebSocket.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage')!;
            // The page never sees `__connected__`: every frame of that type is dropped.
            Object.defineProperty(proto, 'onmessage', {
                configurable: true,
                get() { return descriptor.get!.call(this); },
                set(handler: any) {
                    descriptor.set!.call(this, handler && ((event: any) => { if (!String(event.data).includes('__connected__')) handler(event); }));
                },
            });
            const began = Date.now();
            const result = await outcome(api.hello({ n: 1 }));
            return { result, ms: Date.now() - began };
        },
        timeoutMs: 20000,
        check: ({ result }) => {
            assert(result.result.resolved?.hello?.n === 1, `the call was not answered: ${JSON.stringify(result.result)}`);
            assert(result.ms < 5000, `the call waited ${result.ms} ms`);
        },
    },
];

await runScenarios(import.meta.path, 'Clock skew (browser client)', scenarios);
