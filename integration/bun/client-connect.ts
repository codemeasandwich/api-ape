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
];

await runScenarios(import.meta.path, 'Connecting (browser client)', scenarios);
