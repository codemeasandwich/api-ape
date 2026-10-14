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
  "strthrow.js": "module.exports = () => { throw 'plain string'; };",
  "falsy.js": "module.exports = (d) => { throw d.v; };",
  "nested.js": "module.exports = () => { throw { why: new Error('inner'), list: [new RangeError('in a list')] }; };",
};

const PROTOTYPES = () => [Object.prototype, Array.prototype, Map.prototype, Set.prototype, Date.prototype, Function.prototype, Map, Set];
const snapshot = () => PROTOTYPES().map((o) => Reflect.ownKeys(o).map(String).sort().join());
/** The text of a call frame, as a peer writes it by hand. */
const frameText = (type, data) => JSON.stringify({ type, data, "createdAt<!D>": Date.now() });

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

  describe("pointer targets", () => {
    test.each([
      '{"a":{"__proto__":{"__proto__":{"isAdmin<!P>":["data","yes"]}}},"a<!M>":{},"yes":true}',
      '{"a":{"constructor":{"x<!P>":["yes"]}},"a<!M>":{},"yes":"PWNED"}',
      '{"a":{"__proto__":{"y<!P>":["yes"]}},"a<!S>":[],"yes":1}',
      '{"a":{"__proto__":{"y<!P>":["yes"]}},"a<!D>":0,"yes":1}',
    ])("a frame whose pointer would land on a prototype changes nothing and the socket keeps working: %s", async (data) => {
      const raw = await peer();
      const before = snapshot();

      raw.callRaw(`{"type":"echo","data":${data},"createdAt<!D>":${Date.now()}}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(snapshot()).toEqual(before);
      expect(({}).isAdmin).toBeUndefined();
      expect(new Map().x).toBeUndefined();
      expect((await raw.reply(raw.call("echo", { ok: 1 }))).data).toEqual({ echo: { ok: 1 } });
      raw.close();
    });
  });

  describe("an inline binary tag", () => {
    test("a tag that only claims a length allocates nothing: the next call is answered at once", async () => {
      const raw = await peer();
      const started = Date.now();

      raw.callRaw(frameText("echo", { "a<!I>": { length: 50000000 } }));
      const frame = await raw.reply(raw.call("echo", { honest: true }));

      expect(Date.now() - started).toBeLessThan(1000);
      expect(frame.data).toEqual({ echo: { honest: true } });
      raw.close();
    });
  });

  describe("stacks", () => {
    const noPath = (frame) => {
      // `inspect` prints an Error's stack, which JSON.stringify would hide
      const text = require("util").inspect(frame, { depth: null });
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain(dir);
      expect(text).not.toContain("node_modules");
    };

    test("an unknown endpoint answers an Error whose stack is its name and message, no server path", async () => {
      const raw = await peer();

      const frame = await raw.reply(raw.call("nope", {}));

      expect(frame.err.stack).toBe('Error: TypeError: "nope" was not found');
      noPath(frame);
      raw.close();
    });

    test("a controller that throws a string answers an Error with no server path in its stack", async () => {
      const raw = await peer();

      const frame = await raw.reply(raw.call("strthrow", {}));

      expect(frame.err.message).toBe("plain string");
      expect(frame.err.stack).toBe("Error: plain string");
      noPath(frame);
      raw.close();
    });

    test("Errors inside a thrown object or array arrive without their stacks", async () => {
      const raw = await peer();

      const frame = await raw.reply(raw.call("nested", {}));

      expect(frame.err.why.message).toBe("inner");
      expect(frame.err.list[0]).toBeInstanceOf(RangeError);
      noPath(frame);
      raw.close();
    });
  });

  describe("falsy throws", () => {
    test.each([[0, "0"], ["", "empty"], [null, "null"], [false, "false"]])("a controller that throws %p is an error reply, not a success", async (value) => {
      const raw = await peer();

      const frame = await raw.reply(raw.call("falsy", { v: value }));

      expect(frame.err).toBeInstanceOf(Error);
      expect(frame.err.message).toMatch(/threw/);
      raw.close();
    });
  });

  describe("message size", () => {
    test("a message over the default 16 MiB closes the socket (1009), the server keeps serving", async () => {
      const shipped = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "shipped", maxMessageBytes: undefined } });
      const raw = await connectRaw(shipped, "shipped");
      const closed = new Promise((resolve) => raw.ws.once("close", (code) => resolve(code)));

      raw.callRaw(frameText("echo", { pad: "x".repeat(17 * 1024 * 1024) }));

      expect(await closed).toBe(1009);
      const other = await peer();
      expect((await other.reply(other.call("echo", { ok: 1 }))).data).toEqual({ echo: { ok: 1 } });
      other.close();
    }, 60000); // builds and sends a 17 MiB frame: slow on a loaded machine

    test("maxMessageBytes sets the limit: a bigger message is refused, a smaller one answered", async () => {
      const small = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "small", maxMessageBytes: 2000 } });
      const raw = await connectRaw(small, "small");
      expect((await raw.reply(raw.call("echo", { pad: "x".repeat(500) }))).data.echo.pad).toHaveLength(500);
      const closed = new Promise((resolve) => raw.ws.once("close", (code) => resolve(code)));

      raw.callRaw(frameText("echo", { pad: "x".repeat(3000) }));

      expect(await closed).toBe(1009);
    });

    test("a message sent as fragments counts as one: fragments that add up to over the limit close the socket", async () => {
      const small = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "frag", maxMessageBytes: 2000 } });
      const raw = await connectRaw(small, "frag");
      const closed = new Promise((resolve) => raw.ws.once("close", (code) => resolve(code)));
      const half = "x".repeat(1500);

      raw.ws.send(half, { fin: false });
      raw.ws.send(half, { fin: true });

      expect(await closed).toBe(1009);
    });

    test("a frame announcing a 64-bit length closes the connection with 1009 and the server keeps running", async () => {
      const net = require("net");
      const sock = net.connect(server.port, server.host);
      const received = [];
      sock.on("data", (chunk) => received.push(chunk));
      const closed = new Promise((resolve) => sock.on("close", resolve));
      sock.write(
        "GET /hostile/ape HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
      );
      await new Promise((resolve) => setTimeout(resolve, 200));

      sock.write(Buffer.from([0x81, 0xff, 0, 0, 0, 1, 0, 0, 0, 0])); // one text frame, length 2^32
      await closed;

      expect(Buffer.concat(received).includes(Buffer.from([0x03, 0xf1]))).toBe(true); // close code 1009
      const other = await peer();
      expect((await other.reply(other.call("echo", { ok: 1 }))).data).toEqual({ echo: { ok: 1 } });
      other.close();
    });
  });
});
