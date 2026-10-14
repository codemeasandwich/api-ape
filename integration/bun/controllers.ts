#!/usr/bin/env bun
/**
 * Programmatic controllers (4.5.0), through the real browser client against a real
 * `Bun.serve` + `apeBun({ controllers })` server: no controller folder on disk.
 *
 * The compiled-executable half of this story (a `bun build --compile` binary started
 * from another folder) is `compiled-binary.ts`.
 *
 * Usage: bun integration/bun/controllers.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/controllers.ts   (fails: no `controllers` option)
 */
import { runScenarios, assert, type Scenario } from './scenario-runner';

const controllers = {
    'cards/move': (d: any) => ({ moved: d.id, to: d.to }),
    'users/profile': { default: () => ({ name: 'Ada' }) },
    'whoami': function (this: any) { return { user: this.user, clientId: typeof this.clientId }; },
};

const scenarios: Scenario[] = [
    {
        name: 'a page calls a nested endpoint, an export-default endpoint and `this` of a server that has no controller folder',
        fixtures: {},
        apeOptions: { where: undefined, controllers },
        browser: async ({ api }) => ({
            moved: await api.cards.move({ id: 7, to: 'done' }),
            profile: await api.users.profile({}),
            who: await api.whoami({}),
        }),
        check: ({ result }) => {
            assert(result.moved?.moved === 7 && result.moved?.to === 'done', `cards/move: ${JSON.stringify(result.moved)}`);
            assert(result.profile?.name === 'Ada', `users/profile (export default): ${JSON.stringify(result.profile)}`);
            assert(result.who?.clientId === 'string', `this.clientId inside a map controller: ${JSON.stringify(result.who)}`);
        },
    },
    {
        name: 'a page that calls an endpoint missing from the map gets "was not found", not a hang',
        fixtures: {},
        apeOptions: { where: undefined, controllers },
        browser: async ({ api }) => {
            try { await api.cards.nope({}); return { ok: true }; }
            catch (e: any) { return { message: String(e?.message ?? e) }; }
        },
        check: ({ result }) => assert(result.message?.includes('was not found'), `got ${JSON.stringify(result)}`),
    },
];

runScenarios(import.meta.path, 'apeBun({ controllers }) through the browser client', scenarios);
