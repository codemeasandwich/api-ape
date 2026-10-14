#!/usr/bin/env bun
/**
 * The HTTP streaming transport, through the real browser client against a real `ape()`
 * server on a Node `http.Server` (the only server with the long-poll path).
 *
 * The page's WebSocket is refused (what a proxy that blocks upgrades looks like), so
 * the client falls back to SSE + POST. Every story here has a WebSocket twin in
 * `client-errors.ts` / `client-calls.ts` / the call-contract stories: a call must
 * behave the same whichever transport carries it.
 *
 * Usage: bun integration/bun/client-streaming.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-streaming.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;
const boom = `module.exports = function (d) {
  if (d.kind === 'type') throw new TypeError('wrong type');
  if (d.kind === 'coded') throw Object.assign(new Error('conflict'), { code: 'CONFLICT', data: { current: 3 } });
  if (d.kind === 'string') throw 'plain string';
  if (d.kind === 'plain') throw { status: 409, stack: 'at /srv/app/secret.js:1:1' };
  throw new Error('generic');
};`;

/** Call and describe how it failed, as a page's catch block would see it. */
const failure = (call: () => Promise<any>) => call().then(() => ({ ok: true }), (e: any) => ({
    isError: e instanceof Error, name: e?.name, message: e?.message ?? String(e), code: e?.code, data: e?.data,
    stack: String(e?.stack ?? ''), status: e?.status,
}));

const base = { server: 'node', noWebSocket: true } as const;

const scenarios: Scenario[] = [
    {
        ...base,
        name: 'a page whose WebSockets are blocked calls an endpoint over HTTP streaming and gets the reply',
        fixtures: { 'hello.js': hello },
        browser: async ({ api }) => {
            const reply = await api.hello({ n: 1 });
            return { reply, transport: api.transport };
        },
        check: ({ result }) => {
            assert(result.transport === 'polling', `the page used ${result.transport}, expected the streaming fallback`);
            assert(result.reply?.hello?.n === 1, `unexpected reply ${JSON.stringify(result.reply)}`);
        },
    },
    {
        ...base,
        name: 'over streaming, a page that calls an endpoint twice in a row gets both replies',
        fixtures: { 'hello.js': hello },
        browser: async ({ api }) => {
            const first = await api.hello({ n: 1 });
            const second = await api.hello({ n: 2 }); // made once the page is connected
            return { first, second };
        },
        check: ({ result }) => {
            assert(result.first?.hello?.n === 1 && result.second?.hello?.n === 2, `got ${JSON.stringify(result)}`);
        },
    },
    {
        ...base,
        name: 'over streaming, a controller that throws a TypeError reaches the catch block as a TypeError with its message',
        fixtures: { 'boom.js': boom },
        browser: async ({ api }) => failure(() => api.boom({ kind: 'type' })),
        check: ({ result }) => {
            assert(result.isError === true && result.name === 'TypeError', `expected a TypeError, got ${JSON.stringify(result)}`);
            assert(result.message === 'wrong type', `message was ${JSON.stringify(result.message)} (not "Request failed: 500")`);
        },
    },
    {
        ...base,
        name: 'over streaming, an error carries the code and data the controller attached, and no server paths',
        fixtures: { 'boom.js': boom },
        browser: async ({ api }) => failure(() => api.boom({ kind: 'coded' })),
        check: ({ result, ctl }) => {
            assert(result.message === 'conflict', `message was ${JSON.stringify(result.message)}`);
            assert(result.code === 'CONFLICT', `err.code was ${JSON.stringify(result.code)}`);
            assert(result.data?.current === 3, `err.data was ${JSON.stringify(result.data)}`);
            assert(!result.stack.includes(ctl.dir), `the server's file path reached the page: ${result.stack}`);
        },
    },
    {
        ...base,
        name: 'over streaming, a thrown string arrives as an Error carrying it, and a thrown plain object arrives without its stack',
        fixtures: { 'boom.js': boom },
        browser: async ({ api }) => ({
            string: await failure(() => api.boom({ kind: 'string' })),
            plain: await failure(() => api.boom({ kind: 'plain' })),
        }),
        check: ({ result }) => {
            assert(result.string.isError === true && result.string.message === 'plain string', `got ${JSON.stringify(result.string)}`);
            assert(result.plain.status === 409 || result.plain.message?.includes('409'), `got ${JSON.stringify(result.plain)}`);
            assert(!JSON.stringify(result.plain).includes('/srv/app/secret'), `the thrown stack reached the page: ${JSON.stringify(result.plain)}`);
        },
    },
    {
        ...base,
        name: 'over streaming, a call to an endpoint that does not exist fails with the same message as over a WebSocket',
        fixtures: { 'hello.js': hello },
        browser: async ({ api }) => ({
            missing: await failure(() => api.nope({})),
            inherited: await failure(() => api.valueOf({})),
        }),
        check: ({ result }) => {
            assert(result.missing.message.includes('"nope" was not found'), `got ${JSON.stringify(result.missing)}`);
            assert(result.inherited.message.includes('"valueOf" was not found'), `an inherited name must not be an endpoint: ${JSON.stringify(result.inherited)}`);
        },
    },
    {
        ...base,
        name: 'over streaming, a controller that returns nothing answers undefined',
        fixtures: { 'nothing.js': `module.exports = function () {};` },
        browser: async ({ api }) => ({ reply: (await api.nothing({})) ?? 'undefined' }),
        check: ({ result }) => {
            assert(result.reply === 'undefined', `expected undefined, got ${JSON.stringify(result.reply)}`);
        },
    },
    {
        ...base,
        name: 'over streaming, this.broadcast reaches the caller and this.broadcastOthers does not',
        fixtures: {
            'announce.js': `module.exports = function (d) { this.broadcast('shout', d); this.broadcastOthers('whisper', d); return 'announced'; };`,
        },
        browser: async ({ api, sleep }) => {
            const heard: string[] = [];
            api.on('shout', () => heard.push('shout'));
            api.on('whisper', () => heard.push('whisper'));
            const reply = await api.announce({ text: 'hi' });
            await sleep(300);
            return { reply, heard };
        },
        check: ({ result }) => {
            assert(result.reply === 'announced', `reply was ${JSON.stringify(result.reply)}`);
            assert(result.heard.join() === 'shout', `the caller heard ${JSON.stringify(result.heard)}, expected only the shout`);
        },
    },
    {
        ...base,
        name: 'over streaming, a controller can call this.keepalive(), and two calls at once do not share this.foo',
        fixtures: {
            'slow.js': `module.exports = async function (d) {
              this.keepalive();
              this.mark = d.tag;
              await new Promise((r) => setTimeout(r, d.ms));
              this.keepalive();
              return { tag: d.tag, markAfter: this.mark };
            };`,
        },
        browser: async ({ api, connectSocket }) => {
            const strays: string[] = [];
            connectSocket().setOnReceiver((m: any) => { if (m.type !== '__connected__') strays.push(String(m.type)); });
            const a = api.slow({ tag: 'A', ms: 400 });
            await new Promise((r) => setTimeout(r, 100));
            const b = api.slow({ tag: 'B', ms: 100 });
            const both = await Promise.all([a, b]);
            await new Promise((r) => setTimeout(r, 200));
            return { both, strays };
        },
        check: ({ result }) => {
            const [a, b] = result.both;
            assert(a.markAfter === 'A' && b.markAfter === 'B', `calls shared a context: ${JSON.stringify(result.both)}`);
            assert(result.strays.length === 0, `a keepalive reached the page as a message: ${JSON.stringify(result.strays)}`);
        },
    },
];

await runScenarios(import.meta.path, 'HTTP streaming (browser client)', scenarios);
