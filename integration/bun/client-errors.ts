#!/usr/bin/env bun
/**
 * Errors and controller files, through the real browser client against a real
 * `Bun.serve` + `apeBun()` server.
 *
 * Usage: bun integration/bun/client-errors.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-errors.ts
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const hello = `module.exports = function (data) { return { hello: data }; };`;
const boom = `module.exports = function (d) {
  if (d.kind === 'type') throw new TypeError('wrong type');
  if (d.kind === 'coded') throw Object.assign(new Error('conflict'), { code: 'CONFLICT', data: { current: 3 } });
  if (d.kind === 'string') throw 'plain string';
  throw new Error('generic');
};`;

/** Call and describe how it failed, as a page's catch block would see it. */
const failure = (call: () => Promise<any>) => call().then(() => ({ ok: true }), (e: any) => ({
    isError: e instanceof Error, name: e?.name, message: e?.message ?? String(e), code: e?.code, data: e?.data,
    stack: String(e?.stack ?? ''), type: typeof e,
}));

const scenarios: Scenario[] = [
    {
        name: 'a page whose call hits a controller that throws a TypeError catches a TypeError with the message and no server paths',
        fixtures: { 'hello.js': hello, 'boom.js': boom },
        browser: async ({ api }) => failure(() => api.boom({ kind: 'type' })),
        check: ({ result, ctl }) => {
            assert(result.isError === true && result.name === 'TypeError', `expected a TypeError, got ${JSON.stringify(result)}`);
            assert(result.message === 'wrong type', `message was ${JSON.stringify(result.message)}`);
            assert(!result.stack.includes(ctl.dir), `the server's file path leaked into the browser: ${result.stack}`);
        },
    },
    {
        name: 'a page catches an error with the code and data the controller attached',
        fixtures: { 'hello.js': hello, 'boom.js': boom },
        browser: async ({ api }) => failure(() => api.boom({ kind: 'coded' })),
        check: ({ result }) => {
            assert(result.isError === true && result.message === 'conflict', `got ${JSON.stringify(result)}`);
            assert(result.code === 'CONFLICT', `err.code was ${JSON.stringify(result.code)}`);
            assert(result.data?.current === 3, `err.data was ${JSON.stringify(result.data)}`);
        },
    },
    {
        name: 'a page whose controller throws a string catches an Error carrying that string',
        fixtures: { 'hello.js': hello, 'boom.js': boom },
        browser: async ({ api }) => failure(() => api.boom({ kind: 'string' })),
        check: ({ result }) => {
            assert(result.isError === true && result.message === 'plain string', `got ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a TypeScript controller written as export default answers like any other',
        fixtures: {
            'hello.js': hello,
            'tsdefault.ts': `export default function (d: { x: number }) { return { doubled: d.x * 2 }; }`,
        },
        selector: ['js', 'ts'],
        browser: ({ api }) => api.tsdefault({ x: 21 }),
        check: ({ result }) => assert(result?.doubled === 42, `export default controller answered ${JSON.stringify(result)}`),
    },
    {
        name: 'type declaration and test files next to TypeScript controllers are not endpoints',
        fixtures: {
            'hello.js': hello,
            'thing.ts': `export default function () { return 'thing'; }`,
            'thing.d.ts': `declare const x: number; export default x;`,
            'thing.test.ts': `throw new Error('a test file must never be loaded as a controller');`,
        },
        selector: ['js', 'ts'],
        browser: async ({ api }) => ({
            thing: await api.thing({}),
            declaration: await failure(() => api['thing.d']({})),
            test: await failure(() => api['thing.test']({})),
        }),
        check: ({ result }) => {
            assert(result.thing === 'thing', `the real controller answered ${JSON.stringify(result.thing)}`);
            assert(result.declaration.message?.includes('was not found'), `thing.d must not be an endpoint: ${JSON.stringify(result.declaration)}`);
            assert(result.test.message?.includes('was not found'), `thing.test must not be an endpoint: ${JSON.stringify(result.test)}`);
        },
    },
];

await runScenarios(import.meta.path, 'Errors and controller files (browser client)', scenarios);
