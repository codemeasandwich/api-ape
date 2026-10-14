#!/usr/bin/env bun
/**
 * A stranger's frames under the real Bun runtime: what a peer can make the server build.
 *
 * Every inbound frame is `jss.parse`d before any controller lookup, so a client that
 * can open a socket can put text in front of the decoder. Before 4.4.0 the Error tag
 * did `new global[name](message)` with the peer's name: on Bun a `Worker` named by the
 * frame ran the frame's script in the server process, and a `WebSocket` made the server
 * dial out. These stories speak the wire protocol by hand to a real `Bun.serve`.
 *
 * Usage: bun integration/bun/security-decode.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/security-decode.ts
 *        (APE_ROOT lets you confirm the stories fail against api-ape 4.3.1 and earlier)
 */

import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, basename } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');
const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
(await import(resolve(ROOT, 'utils/apeLogger.js'))).configureApeLogging(false);

const dir = mkdtempSync(join(tmpdir(), 'ape-bun-hostile-'));
writeFileSync(join(dir, 'echo.js'), `module.exports = (d) => ({ echo: d });`);
const prefix = basename(dir);

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
    const t = Date.now();
    try { await fn(); console.log(`  OK ${name} (${Date.now() - t}ms)`); }
    catch (e: any) { failures++; console.log(`  FAIL ${name}\n    ${e.message}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const ape = apeBun({ where: dir });
const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return ape.fetch(req, srv) ?? new Response('nope', { status: 404 }); },
    websocket: ape.websocket,
});

/** A raw peer: sends the given frame text, resolves with the reply frame (or null on timeout). */
async function peer(frameText: string): Promise<any | null> {
    const ws = new WebSocket(`ws://localhost:${server.port}/${prefix}/ape`);
    const frames: any[] = [];
    ws.onmessage = (e) => { try { frames.push(JSON.parse(e.data as string)); } catch { /* binary */ } };
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('socket did not open')); });
    ws.send(frameText);
    const until = Date.now() + 2000;
    while (Date.now() < until) {
        const reply = frames.find((f) => f.queryId && !f._keepalive);
        if (reply) { ws.close(); return reply; }
        await Bun.sleep(10);
    }
    ws.close();
    return null;
}

const errorFrame = (name: string, message: string) =>
    JSON.stringify({ type: 'echo', data: { 'e<!E>': [name, message, 'stack'] }, createdAt: { $: 1 } });

console.log(`Bun ${Bun.version}`);

await test('a frame naming Worker as its error class does not run the script it carries in the server process', async () => {
    const marker = join(dir, 'worker-ran');
    const script = `import('node:fs').then((fs) => fs.writeFileSync(${JSON.stringify(marker)}, 'ran'))`;
    const reply = await peer(errorFrame('Worker', `data:text/javascript,${encodeURIComponent(script)}`));
    await Bun.sleep(1200); // a Worker would have started and written the marker by now
    assert(!existsSync(marker), 'the peer\'s script ran in the server process (Worker was constructed)');
    assert(reply !== null, 'the server never answered the frame');
});

await test('a frame naming WebSocket as its error class does not make the server open a connection', async () => {
    let connections = 0;
    const listener = Bun.listen({
        hostname: '127.0.0.1', port: 0,
        socket: { open() { connections++; }, data() {}, close() {} },
    });
    const reply = await peer(errorFrame('WebSocket', `ws://127.0.0.1:${listener.port}/`));
    await Bun.sleep(600);
    listener.stop(true);
    assert(connections === 0, `the server dialled out to the address in the peer's frame (${connections} connection(s))`);
    assert(reply !== null, 'the server never answered the frame');
});

await test('the server still answers honest calls, and a standard TypeError still round-trips', async () => {
    const hostile = await peer(errorFrame('Function', 'return process'));
    assert(hostile?.data?.echo?.['e<!E>']?.[0] === 'Function', `the unlisted name came back as ${JSON.stringify(hostile?.data)}`);
    const honest = await peer(JSON.stringify({ type: 'echo', data: { 'e<!E>': ['TypeError', 'bad', 'stack'] }, createdAt: { $: 1 } }));
    assert(honest?.data?.echo?.['e<!E>']?.[0] === 'TypeError', `TypeError came back as ${JSON.stringify(honest?.data)}`);
});

ape.close(); server.stop(true);
rmSync(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
