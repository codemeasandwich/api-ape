#!/usr/bin/env bun
/**
 * A page must not be pushed around by what its server sends, any more than a server by
 * what a client sends. The real browser client against a real `Bun.serve`, with controllers
 * (or a hand-made reply) sending hostile shapes.
 *
 * Usage: bun integration/bun/client-hostile-server.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/client-hostile-server.ts
 */
import { resolve } from 'path';
import { runScenarios, assert, ROOT, type Scenario } from './scenario-runner';

const scenarios: Scenario[] = [
    {
        name: 'a reply that names a file under constructor.prototype (or __proto__) does not change what every object in the page inherits',
        fixtures: { 'hello.js': `module.exports = () => 'hi';` },
        // The download step of a reply (`<!L>` links) and its key cleaning, called as the client does with a hostile reply.
        browser: async () => {
            const { setValueAtPath, cleanTaggedKeys } = await import(resolve(ROOT, 'client/connection/fileUtils.js'));
            const reply = JSON.parse('{"constructor.prototype":{"x<!L>":"h1"},"__proto__<!L>":"h2","kept":1}');
            const cleaned = cleanTaggedKeys(reply, 'L');
            let refused = 'no';
            try { setValueAtPath(cleaned, 'constructor.prototype.x', new ArrayBuffer(1)); } catch { refused = 'yes'; }
            return {
                refused,
                kept: cleaned.kept,
                inherited: ({} as any).x === undefined ? 'clean' : 'POLLUTED',
                prototype: Object.getPrototypeOf(cleaned) === Object.prototype ? 'intact' : 'REPLACED',
            };
        },
        check: ({ result }) => {
            assert(result.inherited === 'clean', `a reply wrote to Object.prototype in the page: ${JSON.stringify(result)}`);
            assert(result.prototype === 'intact', `a reply replaced the prototype of its own data: ${JSON.stringify(result)}`);
            assert(result.refused === 'yes' && result.kept === 1, `unexpected outcome ${JSON.stringify(result)}`);
        },
    },
    {
        name: 'a server push whose type is a name every object inherits (constructor) reaches a universal receiver and breaks nothing',
        fixtures: {
            'push.js': `module.exports = function () { this.send('constructor', { n: 1 }); this.send('toString', { n: 2 }); return 'sent'; };`,
        },
        browser: async ({ api, connectSocket, sleep }) => {
            const heard: string[] = [];
            connectSocket().setOnReceiver((m: any) => { if (m.type !== '__connected__') heard.push(m.type); });
            await api.push({});
            await sleep(300);
            return { heard };
        },
        check: ({ result, errors }) => {
            assert(result.heard.join() === 'constructor,toString', `the page heard ${JSON.stringify(result.heard)}`);
            assert(errors.length === 0, `the page suffered ${errors.join('; ')}`);
        },
    },
];

await runScenarios(import.meta.path, 'Hostile server (browser client)', scenarios);
