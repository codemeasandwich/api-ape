/**
 * @fileoverview Tests for the `api-ape/bun` entry point (server/lib/bun.js).
 *
 * Domain context: a Bun app serves api-ape through `Bun.serve({ fetch, websocket })`.
 * The fetch handler must (1) refuse a foreign Origin with a 403 before the
 * upgrade, (2) hand controllers the same headers/session/agent Node would,
 * (3) keep `this.keepalive()` working through the Bun socket adapter, and
 * (4) keep hot reload off unless asked.
 *
 * Technical context: bun.js is excluded from the Jest coverage threshold (it is
 * Bun-specific), but its logic runs fine on Node with a fake `server.upgrade`
 * and a fake Bun socket. The real thing is exercised by
 * integration/bun/security.ts under Bun itself.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const messageHash = require("../../utils/messageHash");
const { apeBun } = require("./bun");
const { _clients } = require("./broadcast/clients");
const { resetFileTransferManager } = require("./fileTransfer");
const { EventEmitter } = require("events");

/** A fake fs.watch result: real recursive watching differs between platforms. */
function fakeWatcher() {
  const w = new EventEmitter();
  w.close = jest.fn();
  w.unref = jest.fn();
  return w;
}


let dir;
let ape;
const CONTROLLERS = {
  "whoami.js": `module.exports = function () {
    return { cookie: this.req.headers.cookie, ua: this.agent && this.agent.browser,
      session: this.sessionId, viaGet: this.req.headers.get('cookie'), url: this.req.url };
  };`,
  "slow.js": `module.exports = function (d) {
    this.keepalive(); this.keepalive();
    return { done: true };
  };`,
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-bun-"));
  for (const [f, c] of Object.entries(CONTROLLERS)) fs.writeFileSync(path.join(dir, f), c);
  ape = apeBun({ where: dir });
});

afterAll(() => {
  // The file-transfer singleton owns a 30 s cleanup interval; stop it so Jest exits.
  resetFileTransferManager();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => _clients.clear());

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

function upgradeReq(headers = {}) {
  return new Request("http://localhost:4318/" + path.basename(dir) + "/ape", {
    headers: { Upgrade: "websocket", Host: "localhost:4318", ...headers },
  });
}

function fakeServer() {
  return { upgrade: jest.fn(() => true) };
}

const tick = () => new Promise((r) => setImmediate(r));

async function connect(headers) {
  const server = fakeServer();
  expect(ape.fetch(upgradeReq(headers), server)).toBeUndefined();
  const ws = { send: jest.fn(), close: jest.fn(), data: server.upgrade.mock.calls[0][1].data };
  ape.websocket.open(ws);
  await tick();
  return ws;
}

async function call(ws, type, data = {}) {
  const msg = JSON.stringify({ type, data });
  ws.send.mockClear();
  ape.websocket.message(ws, msg);
  await tick();
  await tick();
  return { queryId: messageHash(msg), frames: ws.send.mock.calls.map((c) => JSON.parse(c[0])) };
}

describe("apeBun fetch — Origin check", () => {
  test("a page on another port of localhost gets 403 and no upgrade", async () => {
    const server = fakeServer();
    const res = ape.fetch(upgradeReq({ Origin: "http://localhost:9999" }), server);
    expect(res.status).toBe(403);
    expect(server.upgrade).not.toHaveBeenCalled();
  });

  test("the exact origin and a missing origin are upgraded", () => {
    const server = fakeServer();
    expect(ape.fetch(upgradeReq({ Origin: "http://localhost:4318" }), server)).toBeUndefined();
    expect(ape.fetch(upgradeReq(), server)).toBeUndefined();
    expect(server.upgrade).toHaveBeenCalledTimes(2);
  });

  test("the `origin` option can add an allowed origin or restore root-domain matching", () => {
    const server = fakeServer();
    const loose = apeBun({ where: dir, origin: { mode: "root-domain" } });
    expect(loose.fetch(upgradeReq({ Origin: "http://localhost:9999" }), server)).toBeUndefined();
    const listed = apeBun({ where: dir, origin: { allowedOrigins: ["http://localhost:5173"] } });
    expect(listed.fetch(upgradeReq({ Origin: "http://localhost:5173" }), server)).toBeUndefined();
  });

  test("a bad `origin` option throws at start-up", () => {
    expect(() => apeBun({ where: dir, origin: { mode: "nope" } })).toThrow(/origin\.mode/);
  });

  test("non-api routes fall through with null; ping answers", async () => {
    expect(ape.fetch(new Request("http://localhost:4318/other"), fakeServer())).toBeNull();
    const res = ape.fetch(new Request(`http://localhost:4318/${path.basename(dir)}/ape/ping`), fakeServer());
    expect((await res.json()).ok).toBe(true);
  });
});

describe("apeBun controllers see the Node-shaped request", () => {
  test("cookie, session id, user agent and Fetch accessors all reach the controller", async () => {
    const ws = await connect({ Cookie: "a=1; sessionId=S42", "User-Agent": UA });
    const { queryId, frames } = await call(ws, "whoami");
    const reply = frames.find((f) => f.queryId === queryId);
    expect(reply.data.cookie).toBe("a=1; sessionId=S42");
    expect(reply.data.session).toBe("S42");
    expect(reply.data.ua).toBeTruthy();
    expect(reply.data.viaGet).toBe("a=1; sessionId=S42");
    expect(reply.data.url).toBe("/" + path.basename(dir) + "/ape");
  });
});

describe("keepalive through the Bun socket", () => {
  // Scenario: a slow controller calls this.keepalive(). The client sees
  // `{ queryId, _keepalive: true }` frames before the final result, all on the
  // same queryId, so its per-call timer can be reset without resolving the call.
  test("sends _keepalive frames for the call, then the result", async () => {
    const ws = await connect({});
    const { queryId, frames } = await call(ws, "slow");
    const mine = frames.filter((f) => f.queryId === queryId);
    expect(mine.map((f) => !!f._keepalive)).toEqual([true, true, false]);
    expect(mine[2].data).toEqual({ done: true });
  });
});

describe("apeBun websocket config and hot reload", () => {
  test("websocketOptions are merged into the Bun websocket handler object", () => {
    const tuned = apeBun({ where: dir, websocketOptions: { idleTimeout: 960, sendPings: true } });
    expect(tuned.websocket.idleTimeout).toBe(960);
    expect(tuned.websocket.sendPings).toBe(true);
    expect(typeof tuned.websocket.open).toBe("function");
    expect(ape.websocket.idleTimeout).toBeUndefined();
  });

  test("an unknown websocketOptions key throws", () => {
    expect(() => apeBun({ where: dir, websocketOptions: { bogus: 1 } })).toThrow(/bogus/);
  });

  test("hot reload is off by default and on only with `watch`", () => {
    const watchSpy = jest.spyOn(fs, "watch").mockImplementation(() => fakeWatcher());
    try {
      apeBun({ where: dir });
      expect(watchSpy).not.toHaveBeenCalled();
      const watched = apeBun({ where: dir, watch: true });
      expect(watchSpy).toHaveBeenCalledTimes(1);
      expect(watched.fetch).toBeInstanceOf(Function);
      const watcher = watchSpy.mock.results[0].value;
      const closeSpy = jest.spyOn(watcher, "close");
      watched.close();
      expect(closeSpy).toHaveBeenCalled();
      ape.close(); // not watched: a no-op
    } finally {
      watchSpy.mockRestore();
    }
  });
});
