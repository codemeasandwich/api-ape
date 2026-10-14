#!/usr/bin/env bun
/**
 * The page-facing API, through the real browser client against a real
 * `Bun.serve` + `apeBun()` server: `import api from 'api-ape'` as the README shows it.
 *
 * Usage: bun integration/bun/client-api.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-api.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;
const thing = `module.exports = function (data) { return { path: 'dir/thing', data }; };`;
const dirIndex = `module.exports = function (data) { return { path: 'dir', data }; };`;
const pingPong = `module.exports = function () { this.send('pong', { n: 1 }); return 'sent'; };`;

const scenarios: Scenario[] = [
    {
        name: 'a page calls a nested endpoint as api.dir.thing() and an index as api.dir()',
        fixtures: { 'hello.js': hello, 'dir/thing.js': thing, 'dir/index.js': dirIndex },
        browser: async ({ api }) => {
            const nested = await api.dir.thing({ a: 1 });
            const index = await api.dir({ b: 2 });
            return { nested, index };
        },
        check: ({ result }) => {
            assert(result.nested?.path === 'dir/thing' && result.nested.data.a === 1, `api.dir.thing() got ${JSON.stringify(result.nested)}`);
            assert(result.index?.path === 'dir' && result.index.data.b === 2, `api.dir() got ${JSON.stringify(result.index)}`);
        },
    },
    {
        name: 'a page that subscribes before it has connected gets its unsubscribe function at once and then receives the channel',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, emit, waitForState, sleep }) => {
            const got: any[] = [];
            const off = api.news.banking((data: any) => got.push(data)); // before any connection
            const type = typeof off;
            await waitForState('connected');
            await sleep(200);
            await emit('publish-1');
            await sleep(300);
            if (type === 'function') off();
            await sleep(100);
            await emit('publish-2');
            await sleep(300);
            return { type, got };
        },
        onEvent: {
            'publish-1': (ctl) => ctl.publish('/news/banking', { n: 1 }),
            'publish-2': (ctl) => ctl.publish('/news/banking', { n: 2 }),
        },
        check: ({ result }) => {
            assert(result.type === 'function', `an early subscribe returned ${result.type}, expected the unsubscribe function`);
            assert(result.got.length === 1 && result.got[0].n === 1, `expected exactly the message published before unsubscribe, got ${JSON.stringify(result.got)}`);
        },
    },
    {
        name: 'a page can listen for everything the server pushes to it with api.on(type, handler)',
        fixtures: { 'hello.js': hello, 'pingpong.js': pingPong },
        browser: async ({ api, waitForState, sleep }) => {
            const got: any[] = [];
            api.on('pong', (event: any) => got.push(event));
            await api.hello({});
            await waitForState('connected');
            await api.pingpong({});
            await sleep(300);
            return got;
        },
        check: ({ result }) => {
            assert(result.length === 1 && result[0].type === 'pong' && result[0].data.n === 1, `api.on handler got ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a page can read api.transport and api.onConnectionChange on the default export',
        fixtures: { 'hello.js': hello },
        browser: async ({ api, waitForState }) => {
            const seen: string[] = [];
            const off = api.onConnectionChange((s: string) => seen.push(s));
            await api.hello({});
            await waitForState('connected');
            off();
            return { transport: api.transport, seen };
        },
        check: ({ result }) => {
            assert(result.transport === 'websocket', `api.transport was ${JSON.stringify(result.transport)}`);
            assert(result.seen.includes('connected'), `onConnectionChange never reported connected: ${result.seen.join(',')}`);
        },
    },
];

await runScenarios(import.meta.path, 'Page API (browser client)', scenarios);
