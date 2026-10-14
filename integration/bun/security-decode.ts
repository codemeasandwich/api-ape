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
 *        (APE_ROOT lets you confirm the stories fail against api-ape 4.3.0 and earlier)
 */

import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, basename } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');
const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
(await import(resolve(ROOT, 'utils/apeLogger.js'))).configureApeLogging(false);

const dir = mkdtempSync(join(tmpdir(), 'ape-bun-hostile-'));
writeFileSync(join(dir, 'echo.js'), `module.exports = (d) => ({ echo: d });`);
writeFileSync(join(dir, 'strthrow.js'), `module.exports = () => { throw 'plain string'; };`);
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

/** A raw peer: sends the given frame text, resolves with the reply frame (or null after `waitMs`). */
async function peer(frameText: string, waitMs = 2000): Promise<any | null> {
    const ws = new WebSocket(`ws://localhost:${server.port}/${prefix}/ape`);
    const frames: any[] = [];
    ws.onmessage = (e) => { try { frames.push(JSON.parse(e.data as string)); } catch { /* binary */ } };
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('socket did not open')); });
    ws.send(frameText);
    const until = Date.now() + waitMs;
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

const call = (type: string, data: any) => JSON.stringify({ type, data, 'createdAt<!D>': Date.now() });
const protoKeys = () => [Object.prototype, Array.prototype, Map.prototype, Set.prototype, Date.prototype, Function.prototype, Map, Set]
    .map((o) => Reflect.ownKeys(o).map(String).sort().join());

await test('a pointer that would land on a prototype changes nothing in the server process, and the server keeps answering', async () => {
    const before = protoKeys();
    for (const data of [
        '{"a":{"__proto__":{"__proto__":{"isAdmin<!P>":["data","yes"]}}},"a<!M>":{},"yes":true}',
        '{"a":{"constructor":{"x<!P>":["yes"]}},"a<!M>":{},"yes":"PWNED"}',
    ]) await peer(`{"type":"echo","data":${data},"createdAt<!D>":${Date.now()}}`, 200); // refused: no reply
    assert(JSON.stringify(protoKeys()) === JSON.stringify(before), 'a prototype of the server process was changed by a frame');
    assert((({}) as any).isAdmin === undefined && (new Map() as any).x === undefined, 'objects in the server inherit what a peer sent');
    assert((await peer(call('echo', { ok: 1 })))?.data?.echo?.ok === 1, 'the server stopped answering');
});

await test('an inline binary tag that only claims a length allocates nothing', async () => {
    const started = Date.now();
    await peer(call('echo', { 'a<!I>': { length: 100000000 } }), 100); // refused: no reply
    const honest = await peer(call('echo', { ok: 1 }));
    assert(honest?.data?.echo?.ok === 1 && Date.now() - started < 1500, `the server was blocked for ${Date.now() - started} ms`);
});

await test('an unknown endpoint and a thrown string answer stacks with no server path', async () => {
    for (const type of ['nope', 'strthrow']) {
        const reply = await peer(call(type, {}));
        const text = JSON.stringify(reply);
        assert(reply?.['err<!E>'] && !/\\n\s+at /.test(text) && !text.includes(dir), `${type}: the reply carried a server stack: ${text.slice(0, 300)}`);
    }
});

await test('maxMessageBytes closes the socket on a bigger message and answers a smaller one', async () => {
    const small = apeBun({ where: dir, maxMessageBytes: 2000 });
    const smallServer = Bun.serve({ port: 0, fetch: (req, srv) => small.fetch(req, srv) ?? new Response('nope', { status: 404 }), websocket: small.websocket });
    try {
        const ws = new WebSocket(`ws://localhost:${smallServer.port}/${prefix}/ape`);
        const answers: string[] = [];
        ws.onmessage = (e) => answers.push(String(e.data));
        const closed = new Promise<number>((res) => { ws.onclose = (e) => res(e.code); setTimeout(() => res(-1), 3000); });
        await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('socket did not open')); });
        ws.send(call('echo', { pad: 'x'.repeat(300) }));
        await Bun.sleep(300);
        assert(answers.some((a) => a.includes('"pad"')), 'a small message was not answered');
        ws.send(call('echo', { pad: 'x'.repeat(5000) }));
        const code = await closed;
        // Bun's native handler decides the code (the client sees 1006); the point is the socket is closed
        assert(code !== -1, 'the socket stayed open after a message over maxMessageBytes');
    } finally { smallServer.stop(true); small.close(); }
});

ape.close(); server.stop(true);
rmSync(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
