#!/usr/bin/env bun
/**
 * Bun security, headers and keepalive integration tests.
 *
 * Runs api-ape under the real Bun runtime (Bun.serve) and checks:
 *  1. Origin: exact host:port is accepted, another port of localhost is refused
 *     with a 403 BEFORE the upgrade, no Origin is accepted, allowedOrigins works.
 *  2. Headers: cookie, user-agent and session id reach controllers as under Node
 *     (`this.req.headers.cookie`, `this.sessionId`, `this.agent`), and the
 *     `__connected__` frame carries the cookie's session.
 *  3. Keepalive: `this.keepalive()` frames arrive before the result; Bun's own
 *     idleTimeout/sendPings behave as documented (pings keep an idle socket
 *     open, no pings close it).
 *
 * Usage: bun integration/bun/security.ts
 *        APE_ROOT=/path/to/another/checkout bun integration/bun/security.ts
 *        (APE_ROOT lets you confirm the tests fail against an older api-ape)
 */

import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, basename } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');
const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
const messageHash = (await import(resolve(import.meta.dir, '../../utils/messageHash.js'))).default;

const dir = mkdtempSync(join(tmpdir(), 'ape-bun-sec-'));
writeFileSync(join(dir, 'whoami.js'), `module.exports = function () {
  return { cookie: this.req.headers.cookie, session: this.sessionId,
           browser: this.agent && this.agent.browser,
           viaGet: this.req.headers.get('cookie'), ip: this.req.socket.remoteAddress };
};`);
writeFileSync(join(dir, 'slow.js'), `module.exports = async function () {
  this.keepalive();
  await new Promise(r => setTimeout(r, 150));
  this.keepalive();
  await new Promise(r => setTimeout(r, 150));
  return { done: true };
};`);
const prefix = basename(dir);

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
    const t = Date.now();
    try { await fn(); console.log(`  OK ${name} (${Date.now() - t}ms)`); }
    catch (e: any) { failures++; console.log(`  FAIL ${name}\n    ${e.message}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

let connects = 0; // how many times onConnect ran (a refused Origin must not reach it)
function startServer(options: any, wsOptions: any = undefined) {
    const ape = apeBun({ where: dir, ...options, websocketOptions: wsOptions, onConnect: () => { connects++; return {}; } });
    const server = Bun.serve({
        port: 0,
        fetch(req, srv) { return ape.fetch(req, srv) ?? new Response('nope', { status: 404 }); },
        websocket: ape.websocket,
    });
    return { server, port: server.port, ape };
}

/** Open a WebSocket with custom headers; resolves {ws, open, frames}. */
function open(port: number, headers: Record<string, string> = {}) {
    const ws = new (WebSocket as any)(`ws://localhost:${port}/${prefix}/ape`, { headers });
    const frames: any[] = [];
    ws.onmessage = (e: MessageEvent) => { try { frames.push(JSON.parse(e.data as string)); } catch { /* binary */ } };
    const opened = new Promise<boolean>((res) => {
        ws.onopen = () => res(true);
        ws.onerror = () => res(false);
        ws.onclose = () => res(false);
        setTimeout(() => res(false), 3000);
    });
    return { ws, opened, frames };
}

async function rpc(c: ReturnType<typeof open>, type: string) {
    const msg = JSON.stringify({ type, data: {} });
    const queryId = messageHash(msg);
    c.ws.send(msg);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const hit = c.frames.find((f) => f.queryId === queryId && !f._keepalive);
        if (hit) return { reply: hit, mine: c.frames.filter((f) => f.queryId === queryId) };
        await Bun.sleep(10);
    }
    throw new Error(`no reply to ${type}`);
}

async function main() {
    console.log(`Bun ${Bun.version}`);
    const { server, port, ape } = startServer({});

    console.log('\nOrigin');
    await test('exact host:port Origin is accepted', async () => {
        const c = open(port, { Origin: `http://localhost:${port}` });
        assert(await c.opened, 'expected the socket to open'); c.ws.close();
    });
    await test('another port of localhost is refused', async () => {
        const c = open(port, { Origin: `http://localhost:${port + 1}` });
        assert(!(await c.opened), 'socket must not open');
    });
    await test('refused upgrade is an HTTP 403 and never reaches onConnect', async () => {
        const res = await fetch(`http://localhost:${port}/${prefix}/ape`, {
            headers: { Upgrade: 'websocket', Connection: 'Upgrade', Origin: `http://localhost:${port + 1}`,
                       'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' },
        });
        assert(res.status === 403, `expected 403, got ${res.status}`);
    });
    await test('refused origins never reached onConnect', async () => {
        const before = connects;
        const c = open(port, { Origin: `http://localhost:${port + 2}` });
        await c.opened;
        await Bun.sleep(100);
        assert(connects === before, `onConnect ran ${connects - before} time(s) for a refused origin`);
    });
    await test('a foreign domain is refused', async () => {
        const c = open(port, { Origin: 'http://evil.example' });
        assert(!(await c.opened), 'socket must not open');
    });
    await test('no Origin header (non-browser client) is accepted', async () => {
        const c = open(port, {});
        assert(await c.opened, 'expected the socket to open'); c.ws.close();
    });

    console.log('\nHeaders reach controllers');
    await test('cookie, session id, user agent, Fetch accessor and peer address', async () => {
        const c = open(port, { Cookie: 'a=1; sessionId=BUN1; b=2', 'User-Agent': UA });
        assert(await c.opened, 'open');
        const { reply } = await rpc(c, 'whoami');
        assert(reply.data.cookie === 'a=1; sessionId=BUN1; b=2', `cookie: ${reply.data.cookie}`);
        assert(reply.data.session === 'BUN1', `session: ${reply.data.session}`);
        assert(reply.data.browser, `agent: ${reply.data.browser}`);
        assert(reply.data.viaGet === reply.data.cookie, 'headers.get');
        assert(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(reply.data.ip), `ip: ${reply.data.ip}`);
        const connected = c.frames.find((f) => f.type === '__connected__');
        assert(connected && connected.data.sessionId === 'BUN1', 'connected sessionId');
        c.ws.close();
    });
    await test('x-ape-session-id header is honoured', async () => {
        const c = open(port, { 'X-Ape-Session-Id': 'HDR9' });
        assert(await c.opened, 'open');
        const { reply } = await rpc(c, 'whoami');
        assert(reply.data.session === 'HDR9', `session: ${reply.data.session}`);
        c.ws.close();
    });

    console.log('\nKeepalive and ping');
    await test('this.keepalive() frames precede the result on the same queryId', async () => {
        const c = open(port, {});
        assert(await c.opened, 'open');
        const { mine } = await rpc(c, 'slow');
        const kinds = mine.map((f) => (f._keepalive ? 'ka' : 'result'));
        assert(JSON.stringify(kinds) === '["ka","ka","result"]', `frames: ${kinds}`);
        c.ws.close();
    });
    await test('GET /ape/ping answers {ok, ts}', async () => {
        const body: any = await (await fetch(`http://localhost:${port}/${prefix}/ape/ping`)).json();
        assert(body.ok === true && typeof body.ts === 'number', JSON.stringify(body));
    });

    console.log('\nallowedOrigins / allowedHosts');
    const loose = startServer({ origin: { allowedOrigins: ['http://localhost:5173'] } });
    await test('a listed dev-server origin is accepted', async () => {
        const c = open(loose.port, { Origin: 'http://localhost:5173' });
        assert(await c.opened, 'open'); c.ws.close();
    });
    const pinned = startServer({ origin: { allowedHosts: ['localhost:1'] } });
    await test('allowedHosts refuses a Host that is not listed', async () => {
        const c = open(pinned.port, {});
        assert(!(await c.opened), 'socket must not open');
    });
    loose.server.stop(true); pinned.server.stop(true);

    console.log('\nBun idle timeout (api-ape sends no pings of its own)');
    const pinging = startServer({}, { idleTimeout: 2, sendPings: true });
    const silent = startServer({}, { idleTimeout: 2, sendPings: false });
    // Bun enforces idleTimeout on a coarse timer (measured: an idleTimeout of 2 or 5
    // closes at about 8 s), so wait 11 s. Both sockets idle at the same time.
    const idleOn = open(pinging.port, {});
    const idleOff = open(silent.port, {});
    assert(await idleOn.opened && await idleOff.opened, 'both sockets open');
    await Bun.sleep(11000);
    await test('sendPings:true keeps an idle socket open past idleTimeout', async () => {
        assert(idleOn.ws.readyState === WebSocket.OPEN, `readyState ${idleOn.ws.readyState}`);
        idleOn.ws.close();
    });
    await test('sendPings:false closes an idle socket after idleTimeout', async () => {
        // The exact moment is Bun's business (coarse timer, may change between
        // versions), so allow up to 30 s in total before calling it a failure.
        for (let i = 0; i < 38 && idleOff.ws.readyState === WebSocket.OPEN; i++) await Bun.sleep(500);
        assert(idleOff.ws.readyState !== WebSocket.OPEN, `still open after 30 s, readyState ${idleOff.ws.readyState}`);
    });
    pinging.server.stop(true); silent.server.stop(true);

    ape.close(); server.stop(true);
    rmSync(dir, { recursive: true, force: true });
    console.log(failures ? `\n${failures} FAILED` : '\nall passed');
    process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
