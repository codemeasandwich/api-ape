#!/usr/bin/env bun
/**
 * apeBun() options, under the real Bun runtime: unsupported options stop startup,
 * mistyped ones are named in a warning, and `logging` is honoured.
 *
 * Usage: bun integration/bun/options.ts
 *        APE_ROOT=/path/to/another/checkout bun integration/bun/options.ts
 */
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');
const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
const { configureApeLogging } = await import(resolve(ROOT, 'utils/apeLogger.js'));

const dir = mkdtempSync(join(tmpdir(), 'ape-bun-options-'));
writeFileSync(join(dir, 'hello.js'), `module.exports = () => 'hi';`);

let failures = 0;
async function test(name: string, fn: () => Promise<void> | void) {
    try { await fn(); console.log(`  OK ${name}`); }
    catch (e: any) { failures++; console.log(`  FAIL ${name}\n    ${e.message}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
function attempt(fn: () => unknown): string | null {
    try { fn(); return null; } catch (e: any) { return String(e.message); }
}

async function main() {
    console.log(`apeBun options (Bun ${Bun.version})`);
    configureApeLogging(false);

    await test('apeBun refuses authFramework instead of leaving endpoints unauthenticated', () => {
        const message = attempt(() => apeBun({ where: dir, authFramework: { createSocketAuth() {} } }));
        assert(message?.includes('"authFramework" option is not supported'), `expected a startup error, got ${JSON.stringify(message)}`);
    });
    await test('apeBun refuses authMiddleware', () => {
        const message = attempt(() => apeBun({ where: dir, authMiddleware: { check() {} } }));
        assert(message?.includes('"authMiddleware" option is not supported'), `expected a startup error, got ${JSON.stringify(message)}`);
    });
    await test('apeBun() with no options object names what is missing instead of a TypeError', () => {
        const message = attempt(() => apeBun());
        assert(message?.includes('options must be an object such as { where: "api" }'), `expected a clear message, got ${JSON.stringify(message)}`);
    });
    await test('a mistyped apeBun option is named in a warning and the server still starts', () => {
        const warnings: string[] = [];
        const ape = apeBun({ where: dir, logging: { log() {}, info() {}, debug() {}, error() {}, warn: (m: string) => warnings.push(m) }, urlPrefixx: 'typo' });
        assert(typeof ape.fetch === 'function', 'apeBun did not return a handler');
        assert(warnings.some((w) => w.includes('"urlPrefixx"')), `no warning naming the option: ${JSON.stringify(warnings)}`);
    });
    await test('apeBun refuses both `where` and `controllers`, and neither, with a message naming both', () => {
        const both = attempt(() => apeBun({ where: dir, controllers: { hello: () => 'hi' } }));
        assert(both?.includes('either `where`') && both.includes('`controllers`') && both.includes('not both'), `both: ${JSON.stringify(both)}`);
        const neither = attempt(() => apeBun({ logging: false }));
        assert(neither?.includes('need `where`') && neither.includes('`controllers`'), `neither: ${JSON.stringify(neither)}`);
    });
    await test('apeBun({ controllers }) names a value that is not a function and a key the folder scan would never serve', () => {
        const notFn = attempt(() => apeBun({ controllers: { 'cards/move': { not: 'a function' } } }));
        assert(notFn?.includes('Endpoint "cards/move"') && notFn.includes('must export a function'), `non-function: ${JSON.stringify(notFn)}`);
        const hidden = attempt(() => apeBun({ controllers: { '_private/helper': () => 1 } }));
        assert(hidden?.includes('"_private/helper"') && hidden.includes('cannot be an endpoint'), `private key: ${JSON.stringify(hidden)}`);
    });
    await test('apeBun logging routes the framework\'s own log lines to the given sink', async () => {
        const lines: string[] = [];
        const ape = apeBun({ where: dir, urlPrefix: 'api', logging: { log: (m: string) => lines.push(m), info() {}, debug() {}, error() {}, warn() {} } });
        const server = Bun.serve({ port: 0, fetch: (req, srv) => ape.fetch(req, srv) ?? new Response('no', { status: 404 }), websocket: ape.websocket });
        try {
            const ws = new WebSocket(`ws://localhost:${server.port}/api/ape`);
            await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('socket did not open')); });
            await Bun.sleep(100);
            ws.close();
            assert(lines.some((l) => /Client added/.test(l)), `the sink saw ${JSON.stringify(lines)}`);
        } finally { server.stop(true); ape.close(); }
    });

    rmSync(dir, { recursive: true, force: true });
    console.log(failures ? `\n${failures} failed` : '\nall passed');
    process.exit(failures ? 1 : 0);
}
main();
