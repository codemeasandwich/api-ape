/**
 * @fileoverview Wire protocol conformance, spoken by an outside program.
 *
 * Imports `api-ape/jss` and `api-ape/messageHash` by their PUBLISHED names (resolved
 * through the package's own `exports`, so this fails if either is not exported) and talks
 * to a real server over a raw WebSocket exactly as the "Wire protocol" section of
 * `server/README.md` describes: `__connected__`, a call and its reply, `data<!U>`,
 * keepalive frames, error frames, subscribe / push / unsubscribe.
 *
 * @module simulator/scenarios/stories/call-contract/wire-protocol
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const jss = require("api-ape/jss");
const messageHash = require("api-ape/messageHash");
const { Harness } = require("../../../harness");

jest.setTimeout(20000);

const CONTROLLERS = {
  "echo.js": "module.exports = (d) => ({ echo: d });",
  "nothing.js": "module.exports = () => {};",
  "slow.js": `module.exports = async function () {
    this.keepalive();
    await new Promise((r) => setTimeout(r, 50));
    this.keepalive();
    return 'done';
  };`,
  "boom.js": "module.exports = () => { throw Object.assign(new RangeError('too far'), { code: 'FAR', data: { by: 2 } }); };",
};

describe("Wire protocol", () => {
  let harness;
  let dir;
  let server;

  beforeEach(async () => {
    jest.resetModules();
    harness = new Harness({ basePort: 38500, connectTimeout: 10000 });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-protocol-"));
    for (const [name, source] of Object.entries(CONTROLLERS)) fs.writeFileSync(path.join(dir, name), source);
    server = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "proto" } });
  });

  afterEach(async () => {
    await harness.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  /**
   * Open a raw protocol client that records every frame.
   *
   * @returns {Promise<Object>} `{ ws, frames, waitFor, call, raw }`
   */
  async function connect() {
    const ws = new WebSocket(`${server.wsUrl}/proto/ape`);
    const frames = [];
    ws.on("message", (data) => frames.push(jss.parse(data.toString())));
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    return {
      ws,
      frames,
      waitFor: (predicate) => harness.waitFor(() => frames.find(predicate), 3000).then(() => frames.find(predicate)),
      /** The queryId of a call is the hash of the exact text sent. */
      call(type, data) {
        const message = jss.stringify({ type, data, createdAt: new Date(), requestedAt: new Date(), nonce: Math.random() });
        ws.send(message);
        return messageHash(message);
      },
      raw: (frame) => ws.send(JSON.stringify(frame)),
    };
  }

  test("the first frame is __connected__ with a clientId and a sessionId", async () => {
    const c = await connect();
    const hello = await c.waitFor((f) => f.type === "__connected__");
    expect(typeof hello.data.clientId).toBe("string");
    expect(typeof hello.data.sessionId).toBe("string");
    c.ws.close();
  });

  test("a call is answered on queryId = messageHash(message), with the controller result in data", async () => {
    const c = await connect();
    const id = c.call("echo", { a: 1 });
    const reply = await c.waitFor((f) => f.queryId === id);
    expect(reply.data).toEqual({ echo: { a: 1 } });
    c.ws.close();
  });

  test("a controller that returns nothing is answered with data<!U>: data parses to undefined", async () => {
    const c = await connect();
    const id = c.call("nothing", {});
    const reply = await c.waitFor((f) => f.queryId === id);
    expect(reply.data).toBeUndefined();
    expect(reply.err).toBeUndefined();
    c.ws.close();
  });

  test("this.keepalive() sends { queryId, _keepalive: true } frames before the reply", async () => {
    const c = await connect();
    const id = c.call("slow", {});
    const reply = await c.waitFor((f) => f.queryId === id && !f._keepalive);
    const own = c.frames.filter((f) => f.queryId === id);
    expect(own.filter((f) => f._keepalive)).toHaveLength(2);
    expect(own[own.length - 1]).toBe(reply);
    expect(reply.data).toBe("done");
    c.ws.close();
  });

  test("a thrown error is answered with err (an Error: name, message), errCode and errData", async () => {
    const c = await connect();
    const id = c.call("boom", {});
    const reply = await c.waitFor((f) => f.queryId === id);
    expect(reply.err).toBeInstanceOf(RangeError);
    expect(reply.err.message).toBe("too far");
    expect(reply.errCode).toBe("FAR");
    expect(reply.errData).toEqual({ by: 2 });
    expect(String(reply.err.stack)).not.toContain(dir);
    c.ws.close();
  });

  test("a call to an unknown endpoint is answered with a not-found err", async () => {
    const c = await connect();
    const id = c.call("missing", {});
    const reply = await c.waitFor((f) => f.queryId === id);
    expect(reply.err.message).toContain("was not found");
    c.ws.close();
  });

  test("{ subscribe } then a publish is pushed as { type: channel, data }; { unsubscribe } stops it", async () => {
    const { publish } = require("api-ape/server");
    const c = await connect();
    c.raw({ subscribe: "/news/banking" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    publish("/news/banking", { n: 1 });
    const push = await c.waitFor((f) => f.type === "/news/banking" && f.data && f.data.n === 1);
    expect(push.queryId).toBeFalsy();

    c.raw({ unsubscribe: "/news/banking" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    publish("/news/banking", { n: 2 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(c.frames.some((f) => f.type === "/news/banking" && f.data && f.data.n === 2)).toBe(false);
    c.ws.close();
  });

  test("a late subscriber gets the last published message at once", async () => {
    const { publish } = require("api-ape/server");
    publish("/news/latest", { n: 9 });
    const late = await connect();
    late.raw({ subscribe: "/news/latest" });
    const push = await late.waitFor((f) => f.type === "/news/latest");
    expect(push.data.n).toBe(9);
    late.ws.close();
  });
});
