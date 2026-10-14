#!/usr/bin/env bun
/**
 * Subscribe authorisation (4.5.0), through the real browser client against a real
 * `Bun.serve` + `apeBun({ onSubscribe })` server.
 *
 * Before 4.5.0 any page could `api.any.channel(callback)` and was handed that channel's
 * retained last message at once. With `onSubscribe` the server decides, the page's second
 * argument hears of a refusal, and a refused page never receives the retained message
 * or a later publish.
 *
 * Usage: bun integration/bun/subscribe.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/subscribe.ts   (fails: no refusal is ever sent)
 */
import { resolve } from 'path';
import { runScenarios, assert, ROOT, type Scenario } from './scenario-runner';

/** Only `/open/...` channels are for pages; the guard also sees who is asking. */
const asked: Array<{ channel: string; keys: string[] }> = [];
const onSubscribe = (channel: string, context: any) => {
    asked.push({ channel, keys: Object.keys(context).sort() });
    return channel.startsWith('/open/');
};

const seed = {
    seed: (ctl: any) => {
        ctl.publish('/open/news', { n: 1 });
        ctl.publish('/closed/news', { secret: 'retained' });
    },
};

const scenarios: Scenario[] = [
    {
        name: 'a page is refused a channel it may not read: its error callback hears, and it gets neither the retained message nor a later publish',
        fixtures: { 'hello.js': `module.exports = () => 'hi';` },
        apeOptions: { onSubscribe },
        onEvent: { ...seed, later: (ctl: any) => { ctl.publish('/closed/news', { secret: 'later' }); ctl.publish('/open/news', { n: 2 }); } },
        browser: async ({ api, emit, sleep }) => {
            await api.hello({}); // connected
            await emit('seed');
            const open: any[] = [];
            const closed: any[] = [];
            const refusals: any[] = [];
            api.open.news((d: any) => open.push(d), (e: any) => refusals.push({ channel: 'open', code: e.code }));
            api.closed.news((d: any) => closed.push(d), (e: any) => refusals.push({ channel: e.data?.channel, code: e.code, message: e.message, isError: e instanceof Error }));
            await sleep(500);
            await emit('later');
            await sleep(400);
            return { open, closed, refusals };
        },
        check: ({ result }) => {
            assert(JSON.stringify(result.open) === JSON.stringify([{ n: 1 }, { n: 2 }]), `the allowed channel: ${JSON.stringify(result.open)}`);
            assert(result.closed.length === 0, `the refused channel delivered ${JSON.stringify(result.closed)}`);
            assert(result.refusals.length === 1, `expected one refusal, got ${JSON.stringify(result.refusals)}`);
            const [r] = result.refusals;
            assert(r.code === 'SUBSCRIBE_REFUSED' && r.channel === '/closed/news' && r.isError === true, `refusal: ${JSON.stringify(r)}`);
            assert(r.message === 'Subscription to "/closed/news" refused', `message: ${r.message}`);
            const seen = asked.find((a) => a.channel === '/closed/news');
            assert(seen && seen.keys.join() === 'clientId,embed,sessionId', `context keys: ${JSON.stringify(seen)}`);
        },
    },
    {
        name: 'a page that gives no error callback and is refused keeps running (a warning, not an exception)',
        fixtures: { 'hello.js': `module.exports = () => 'hi';` },
        apeOptions: { onSubscribe },
        browser: async ({ api, sleep, errors }) => {
            await api.hello({});
            api.closed.room(() => {});
            await sleep(400);
            return { alive: await api.hello({}), errors };
        },
        check: ({ result }) => {
            assert(result.alive === 'hi', `the page stopped working: ${JSON.stringify(result)}`);
            assert(result.errors.length === 0, `the page suffered ${JSON.stringify(result.errors)}`);
        },
    },
    {
        name: 'the server clears a channel\'s retained message: a page that subscribes afterwards gets nothing',
        fixtures: { 'hello.js': `module.exports = () => 'hi';` },
        onEvent: {
            seed: (ctl: any) => { ctl.publish('/dm/ada', { text: 'private' }); },
            clear: async () => { (await import(resolve(ROOT, 'server/lib/broadcast/index.js'))).clearLastMessage('/dm/ada'); },
        },
        browser: async ({ api, emit, sleep }) => {
            await api.hello({});
            await emit('seed');
            await emit('clear');
            const got: any[] = [];
            api.dm.ada((d: any) => got.push(d));
            await sleep(400);
            return got;
        },
        check: ({ result }) => assert(result.length === 0, `the retained message was replayed: ${JSON.stringify(result)}`),
    },
    {
        name: 'a page on HTTP streaming (WebSockets blocked) cannot subscribe at all: it never receives a publish, and onSubscribe is never asked',
        server: 'node',
        noWebSocket: true,
        fixtures: { 'hello.js': `module.exports = () => 'hi';` },
        apeOptions: { onSubscribe },
        onEvent: { seed: (ctl: any) => { ctl.publish('/open/stream', { n: 1 }); } },
        browser: async ({ api, emit, sleep }) => {
            await api.hello({});
            const got: any[] = [];
            api.open.stream((d: any) => got.push(d));
            await sleep(300);
            await emit('seed');
            await sleep(500);
            return got;
        },
        check: ({ result }) => {
            assert(result.length === 0, `a publish reached a streaming page: ${JSON.stringify(result)}`);
            assert(!asked.some((a) => a.channel === '/open/stream'), 'onSubscribe was asked on a path that cannot subscribe');
        },
    },
];

runScenarios(import.meta.path, 'apeBun({ onSubscribe }) through the browser client', scenarios);
