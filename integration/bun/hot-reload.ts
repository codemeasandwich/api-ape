#!/usr/bin/env bun
/**
 * Bun hot-reload integration test (opt-in `watch`).
 *
 * Proves under the real Bun runtime that:
 *  - without `watch`, an edit on disk changes nothing (no mixing in prod);
 *  - with `watch: { paths: [serviceDir] }`, editing a service module reloads it
 *    AND every controller importing it, including a controller whose own file
 *    never changed (coherent reload);
 *  - with `watch: true` alone, modules outside the controller directory stay
 *    cached (the documented limit);
 *  - `.js` controllers and `.ts` services loaded with `require()` reload under Bun.
 *    (ES `import` graphs reloaded in a manual probe on Bun 1.3.14 but are not
 *    covered here; on Node they are never evicted. See README "Hot reload".)
 *
 * Usage: bun integration/bun/hot-reload.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');
const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
const { configureApeLogging } = await import(resolve(import.meta.dir, '../../utils/apeLogger.js'));
const messageHash = (await import(resolve(import.meta.dir, '../../utils/messageHash.js'))).default;
configureApeLogging(false);

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
    try { await fn(); console.log(`  OK ${name}`); }
    catch (e: any) { failures++; console.log(`  FAIL ${name}\n    ${e.message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

/** Fixture: api/a.js + api/b.js import svc/state.ts via require(). */
function fixture() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ape-bun-hot-')));
    mkdirSync(join(root, 'api')); mkdirSync(join(root, 'svc'));
    writeFileSync(join(root, 'svc/state.ts'), "module.exports = { v: 'svc1' };");
    writeFileSync(join(root, 'api/a.js'), "const s = require('../svc/state'); module.exports = function () { return 'a1:' + s.v; };");
    writeFileSync(join(root, 'api/b.js'), "const s = require('../svc/state'); module.exports = function () { return 'b1:' + s.v; };");
    return root;
}

async function call(ws: any, frames: any[], type: string) {
    const msg = JSON.stringify({ type, data: {} });
    const id = messageHash(msg);
    ws.send(msg);
    for (let i = 0; i < 300; i++) {
        const hit = frames.find((f) => f.queryId === id);
        if (hit) { frames.splice(frames.indexOf(hit), 1); return hit.data; }
        await Bun.sleep(10);
    }
    throw new Error('no reply');
}

async function scenario(options: any, edit: (root: string) => void, until: (r: string[]) => boolean) {
    const root = fixture();
    const ape = apeBun({ where: join(root, 'api'), ...options(root) });
    const server = Bun.serve({ port: 0, fetch: (r, s) => ape.fetch(r, s) ?? new Response('no', { status: 404 }), websocket: ape.websocket });
    const ws: any = new WebSocket(`ws://localhost:${server.port}/api/ape`);
    const frames: any[] = [];
    ws.onmessage = (e: MessageEvent) => { try { frames.push(JSON.parse(e.data as string)); } catch {} };
    await new Promise((r) => (ws.onopen = r));
    const read = async () => [await call(ws, frames, 'a'), await call(ws, frames, 'b')];
    const before = await read();
    await Bun.sleep(400); // let the OS watcher arm
    edit(root);
    let after = before;
    for (let i = 0; i < 100 && !until(after); i++) { await Bun.sleep(50); after = await read(); }
    await Bun.sleep(300); after = await read();
    ape.close(); server.stop(true); ws.close(); rmSync(root, { recursive: true, force: true });
    return { before, after };
}

const editBoth = (root: string) => {
    writeFileSync(join(root, 'svc/state.ts'), "module.exports = { v: 'svc2' };");
    writeFileSync(join(root, 'api/a.js'), "const s = require('../svc/state'); module.exports = function () { return 'a2:' + s.v; };");
};

console.log(`Bun ${Bun.version}`);

await test('default (no watch): edits on disk change nothing', async () => {
    const r = await scenario(() => ({}), editBoth, () => false);
    assert(JSON.stringify(r.after) === JSON.stringify(['a1:svc1', 'b1:svc1']), `after: ${r.after}`);
});

await test('watch.paths: service + controllers reload together (b.js untouched sees svc2)', async () => {
    const r = await scenario((root) => ({ watch: { debounceMs: 20, paths: [join(root, 'svc')] } }), editBoth, (a) => a[0].startsWith('a2'));
    assert(JSON.stringify(r.before) === JSON.stringify(['a1:svc1', 'b1:svc1']), `before: ${r.before}`);
    assert(JSON.stringify(r.after) === JSON.stringify(['a2:svc2', 'b1:svc2']), `after: ${r.after}`);
});

await test('watch.paths: editing ONLY the .ts service reloads every controller importing it', async () => {
    const r = await scenario(
        (root) => ({ watch: { debounceMs: 20, paths: [join(root, 'svc')] } }),
        (root) => writeFileSync(join(root, 'svc/state.ts'), "module.exports = { v: 'svc3' };"),
        (a) => a[0].endsWith('svc3'),
    );
    assert(JSON.stringify(r.after) === JSON.stringify(['a1:svc3', 'b1:svc3']), `after: ${r.after}`);
});

await test('watch:true alone: the service outside the controller dir stays cached (documented limit)', async () => {
    const r = await scenario(() => ({ watch: { debounceMs: 20 } }), editBoth, (a) => a[0].startsWith('a2'));
    assert(JSON.stringify(r.after) === JSON.stringify(['a2:svc1', 'b1:svc1']), `after: ${r.after}`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
