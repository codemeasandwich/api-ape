/**
 * @fileoverview Hostile-peer stories: what a stranger on the socket can make a server do.
 *
 * A server mounted with `ape()` accepts frames from any client that can open a
 * WebSocket (there is no auth option; apps put their own gate in front). Every frame is
 * parsed before any lookup, so these stories speak the wire protocol by hand and check,
 * from outside, that the server stays a server: nothing the peer names is constructed,
 * no inherited property is called as if it were a controller, no prototype changes, and
 * honest calls on the same socket keep working.
 *
 * Fixed in 4.4.0 (all earlier versions were affected). Each story failed on 4.3.0 and
 * earlier before the fix.
 *
 * @module simulator/scenarios/stories/call-contract/hostile-peer
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Harness } = require("../../../harness");
const { connectRaw } = require("./raw-client");

jest.setTimeout(20000);

const CONTROLLERS = {
  "echo.js": "module.exports = (d) => ({ echo: d });",
  "probe.js": `module.exports = (d) => ({
    kind: typeof d.x,
    isFunctionConstructor: d.x === Function,
    isObjectPrototype: d.x === Object.prototype,
    isObject: d.x === Object,
  });`,
  "upload.js": "module.exports = (d) => ({ keys: Object.keys(d) });",
};

describe("Hostile peer", () => {
  let harness;
  let dir;
  let server;
  const constructed = [];
  const saved = {};
  const SPIED = ["Worker", "WebSocket", "XMLHttpRequest", "EventSource"];

  /**
   * Open a raw peer and wait for the server's `__connected__` greeting.
   *
   * @returns {Promise<Object>} The raw client, plus `clientId`
   */
  async function peer() {
    const raw = await connectRaw(server, "hostile");
    const until = Date.now() + 3000;
    while (!raw.frames.some((f) => f.type === "__connected__") && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    raw.clientId = raw.frames.find((f) => f.type === "__connected__").data.clientId;
    return raw;
  }

  beforeEach(async () => {
    jest.resetModules();
    constructed.length = 0;
    for (const name of SPIED) {
      saved[name] = Object.getOwnPropertyDescriptor(global, name);
      const Spy = class {
        constructor(...args) {
          constructed.push([name, ...args]);
        }
      };
      Object.defineProperty(global, name, { value: Spy, configurable: true, writable: true });
    }
    harness = new Harness({ basePort: 39000, connectTimeout: 10000 });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-hostile-"));
    for (const [name, source] of Object.entries(CONTROLLERS)) fs.writeFileSync(path.join(dir, name), source);
    server = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "hostile" } });
  });

  afterEach(async () => {
    for (const name of SPIED) {
      delete global[name];
      if (saved[name]) Object.defineProperty(global, name, saved[name]);
    }
    await harness.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    delete Object.prototype.polluted;
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test.each(SPIED)("a frame that names %s as an error class makes the server construct nothing", async (name) => {
    const raw = await peer();

    const frame = await raw.reply(
      raw.call("echo", { "e<!E>": [name, "data:text/javascript,process.exit(1)", "s"] }),
    );

    expect(constructed).toEqual([]);
    expect(frame.data.echo.e).toBeInstanceOf(Error);
    expect(frame.data.echo.e.name).toBe(name);
    // the same socket keeps working for honest calls
    expect((await raw.reply(raw.call("echo", { ok: 1 }))).data).toEqual({ echo: { ok: 1 } });
    raw.close();
  });

  test("a peer that names Function, Proxy or __proto__ as an error class gets a plain Error back and the server carries on", async () => {
    const raw = await peer();

    for (const name of ["Function", "Proxy", "__proto__", "constructor"]) {
      const frame = await raw.reply(raw.call("echo", { "e<!E>": [name, "return process", "s"] }));
      expect(Object.getPrototypeOf(frame.data.echo.e)).toBe(Error.prototype);
      expect(frame.data.echo.e.name).toBe(name);
    }
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    raw.close();
  });

  test.each(["valueOf", "toString", "hasOwnProperty", "constructor", "__proto__", "__defineGetter__"])(
    "a call to %s, a name every object inherits, is not found like any other unknown endpoint",
    async (type) => {
      const raw = await peer();

      const frame = await raw.reply(raw.call(type, { secret: "ask" }));

      expect(frame.err).toBeInstanceOf(Error);
      expect(frame.err.message).toContain(`"${type}" was not found`);
      expect(frame.data).toBeUndefined();
      raw.close();
    },
  );

  test("a pointer in a frame cannot give a controller the Function constructor, Object or a prototype", async () => {
    const raw = await peer();

    for (const target of [["constructor", "constructor"], ["constructor"], ["__proto__"]]) {
      const frame = await raw.reply(raw.call("probe", { "x<!P>": target }));
      expect(frame.data).toEqual({
        kind: "undefined",
        isFunctionConstructor: false,
        isObjectPrototype: false,
        isObject: false,
      });
    }
    raw.close();
  });

  test("an upload whose field name walks to Object.prototype does not change what every object inherits", async () => {
    const raw = await peer();
    const data = { "constructor.prototype": { "polluted<!B>": "h1" } };
    const queryId = raw.call("upload", data);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const put = await fetch(`http://${server.host}:${server.port}/hostile/ape/data/${queryId}/h1`, {
      method: "PUT",
      headers: { "X-Ape-Client-Id": raw.clientId, "Content-Type": "application/octet-stream" },
      body: Buffer.from("payload"),
    });
    await put.text();
    const frame = await raw.reply(queryId);

    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    expect(frame.err).toBeInstanceOf(Error);
    raw.close();
  });

  test("an upload whose field name goes through a text value is refused with an error, and the socket keeps working", async () => {
    const raw = await peer();
    const queryId = raw.call("upload", { a: "text", "a.b<!B>": "h2" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    await fetch(`http://${server.host}:${server.port}/hostile/ape/data/${queryId}/h2`, {
      method: "PUT",
      headers: { "X-Ape-Client-Id": raw.clientId, "Content-Type": "application/octet-stream" },
      body: Buffer.from("payload"),
    }).then((res) => res.text());
    const frame = await raw.reply(queryId);

    expect(frame.err).toBeInstanceOf(Error);
    expect((await raw.reply(raw.call("echo", { still: "up" }))).data).toEqual({ echo: { still: "up" } });
    raw.close();
  });
});
