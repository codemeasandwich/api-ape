/**
 * @fileoverview Long-poll stories: a call over HTTP (SSE stream + POST) behaves as a call
 * over a WebSocket. Spoken with plain `fetch` so every byte is visible.
 *
 * The page-side half (the real browser streaming client) is
 * `integration/bun/client-streaming.ts`; this file covers what the SERVER sends.
 *
 * @module simulator/scenarios/stories/call-contract/long-poll
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const jss = require("../../../../utils/jss");
const { Harness } = require("../../../harness");

jest.setTimeout(20000);

const CONTROLLERS = {
  "hello.js": "module.exports = (d) => ({ hello: d });",
  "nothing.js": "module.exports = () => {};",
  "boom.js": `module.exports = function (d) {
    if (d.kind === 'coded') throw Object.assign(new RangeError('too far'), { code: 'FAR', data: { by: 2 } });
    if (d.kind === 'bigint') throw { big: 1n };
    throw new Error('generic');
  };`,
  "echo.js": "module.exports = (d) => ({ echo: d });",
  "retErr.js": "module.exports = () => ({ failed: new Error('returned'), list: [new TypeError('in a list')] });",
  "strthrow.js": "module.exports = () => { throw 'plain string'; };",
  "falsy.js": "module.exports = (d) => { throw d.v; };",
  "who.js": "module.exports = function () { return { clientId: this.clientId, sessionId: this.sessionId }; };",
  "context.js": `module.exports = function () {
    this.keepalive();
    this.broadcast('shout', { from: this.clientId });
    this.send('private', { ok: true });
    this.send('failure', undefined, Object.assign(new TypeError('pushed'), { code: 'P' }));
    this.send('failure2', undefined, 'pushed string');
    this.send('evt', { e: new Error('pushed') });
    return { hasPublish: typeof this.publish, hasOthers: typeof this.broadcastOthers, clients: typeof this.clients };
  };`,
};

describe("Long poll", () => {
  let harness;
  let dir;
  let server;
  let closeStream;

  /**
   * POST a call as the streaming client does.
   *
   * @param {string} type - Endpoint
   * @param {any} data - Payload
   * @param {string} cookie - `apeClientId=...` cookie
   * @returns {Promise<{status: number, frame: any}>} HTTP status and the parsed JSS frame
   */
  async function post(type, data, cookie) {
    const res = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: jss.stringify({ type, data, createdAt: new Date() }),
    });
    return { status: res.status, frame: jss.parse(await res.text()) };
  }

  beforeEach(async () => {
    jest.resetModules();
    closeStream = new AbortController();
    harness = new Harness({ basePort: 39500, connectTimeout: 10000 });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-poll-"));
    for (const [name, source] of Object.entries(CONTROLLERS)) fs.writeFileSync(path.join(dir, name), source);
    server = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "poll" } });
  });

  afterEach(async () => {
    closeStream.abort();
    await harness.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("a call answers with the reply frame a WebSocket would send, `undefined` included", async () => {
    const cookie = "apeClientId=ABC";

    const hello = await post("hello", { n: 1 }, cookie);
    const nothing = await post("nothing", {}, cookie);

    expect(hello.status).toBe(200);
    expect(hello.frame.data).toEqual({ hello: { n: 1 } });
    expect(hello.frame.queryId).toEqual(expect.any(String));
    expect(nothing.status).toBe(200);
    expect("data" in nothing.frame).toBe(true);
    expect(nothing.frame.data).toBeUndefined();
  });

  test("a controller that throws answers 500 with the Error, its code and data, and no server stack", async () => {
    const { status, frame } = await post("boom", { kind: "coded" }, "apeClientId=ABC");

    expect(status).toBe(500);
    expect(frame.err).toBeInstanceOf(RangeError);
    expect(frame.err.message).toBe("too far");
    expect(frame.err.stack).toBe("RangeError: too far");
    expect(frame.errCode).toBe("FAR");
    expect(frame.errData).toEqual({ by: 2 });
  });

  test("a thrown value that cannot be serialised still gets an error reply", async () => {
    const { status, frame } = await post("boom", { kind: "bigint" }, "apeClientId=ABC");

    expect(status).toBe(500);
    expect(frame.err.message).toMatch(/cannot be sent/);
  });

  test("a call to an unknown endpoint, or to a name every object inherits, answers 404 with the WebSocket's message", async () => {
    for (const type of ["nope", "valueOf", "constructor"]) {
      const { status, frame } = await post(type, {}, "apeClientId=ABC");

      expect(status).toBe(404);
      expect(frame.err.message).toBe(`TypeError: "${type}" was not found`);
    }
  });

  test("a call with no session cookie is told to open the stream first", async () => {
    const res = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, {
      method: "POST",
      body: jss.stringify({ type: "hello", data: {} }),
    });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Missing session/);
  });

  test("a controller on a call with no open stream still has broadcast, publish, clients and a working keepalive", async () => {
    const { status, frame } = await post("context", {}, "apeClientId=ABC");

    expect(status).toBe(200);
    expect(frame.data).toEqual({ hasPublish: "function", hasOthers: "function", clients: "object" });
  });

  test("with the stream open, this.keepalive() and this.broadcast arrive on the stream, and the reply on the POST", async () => {
    const stream = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, { signal: closeStream.signal });
    const cookie = stream.headers.get("set-cookie").split(";")[0];
    const reader = stream.body.getReader();
    let seen = "";
    const readFor = async (needle) => {
      const until = Date.now() + 3000;
      while (!seen.includes(needle) && Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += Buffer.from(value).toString("utf8");
      }
    };
    await readFor("__connected__");

    const { frame } = await post("context", {}, cookie);
    await readFor("evt");

    expect(frame.data.hasOthers).toBe("function");
    const frames = seen.split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => jss.parse(line.slice(6)));
    expect(frames.some((f) => f._keepalive === true && f.queryId === frame.queryId)).toBe(true);
    expect(frames.some((f) => f.type === "shout")).toBe(true);
    expect(frames.some((f) => f.type === "private" && f.data.ok === true)).toBe(true);
    const failure = frames.find((f) => f.type === "failure");
    expect(failure.err).toBeInstanceOf(TypeError);
    expect(failure.err.stack).toBe("TypeError: pushed");
    expect(failure.errCode).toBe("P");
    expect(frames.find((f) => f.type === "failure2").err.stack).toBe("Error: pushed string"); // no server path
    expect(frames.find((f) => f.type === "evt").data.e.stack).toBe("Error: pushed"); // a pushed Error too
    await reader.cancel().catch(() => {});
  });

  test("an embed from onConnect that names clientId or sessionId is what a polled controller sees (as before 4.4.0)", async () => {
    const embedded = await harness.createServer({
      where: dir,
      apeOptions: { urlPrefix: "embedded" },
      onConnect: () => ({ embed: { clientId: "mine", sessionId: "S-1" } }),
    });
    const stream = await fetch(`http://${embedded.host}:${embedded.port}/embedded/ape/poll`, { signal: closeStream.signal });
    const cookie = stream.headers.get("set-cookie").split(";")[0];
    await new Promise((resolve) => setTimeout(resolve, 150)); // onConnect has stored the embed

    const res = await fetch(`http://${embedded.host}:${embedded.port}/embedded/ape/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: jss.stringify({ type: "who", data: {}, createdAt: new Date() }),
    });

    expect(jss.parse(await res.text()).data).toEqual({ clientId: "mine", sessionId: "S-1" });
  });

  test("a polled controller sees the session from the x-ape-session-id header, or a URL-encoded cookie, as on a WebSocket", async () => {
    const call = async (headers) => {
      const res = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "apeClientId=ABC", ...headers },
        body: jss.stringify({ type: "who", data: {}, createdAt: new Date() }),
      });
      return jss.parse(await res.text()).data.sessionId;
    };

    expect(await call({ "x-ape-session-id": "FROM-HEADER" })).toBe("FROM-HEADER");
    expect(await call({ Cookie: "apeClientId=ABC; sessionId=a%20b" })).toBe("a b");
  });

  test.each([
    '{"a":{"__proto__":{"__proto__":{"isAdmin<!P>":["data","yes"]}}},"a<!M>":{},"yes":true}',
    '{"a":{"constructor":{"x<!P>":["yes"]}},"a<!M>":{},"yes":"PWNED"}',
  ])("a POST whose pointer would land on a prototype changes nothing: %s", async (data) => {
    const keys = () => [Object.prototype, Map.prototype, Set.prototype, Map].map((o) => Reflect.ownKeys(o).map(String).sort().join());
    const before = keys();

    const res = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "apeClientId=ABC" },
      body: `{"type":"echo","data":${data},"createdAt<!D>":${Date.now()}}`,
    });
    await res.text();

    expect(res.status).toBe(500);
    expect(keys()).toEqual(before);
    expect(({}).isAdmin).toBeUndefined();
    expect(new Map().x).toBeUndefined();
  });

  test("an unknown endpoint and a thrown string answer stacks with no server path", async () => {
    for (const type of ["nope", "strthrow"]) {
      const { frame } = await post(type, {}, "apeClientId=ABC");

      expect(frame.err.stack).toBe(`${frame.err.name}: ${frame.err.message}`);
      const text = require("util").inspect(frame, { depth: null }); // prints an Error's stack
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain(dir);
    }
  });

  test.each([[0], [""], [null], [false]])("a controller that throws %p is a 500 error frame, not a success", async (value) => {
    const { status, frame } = await post("falsy", { v: value }, "apeClientId=ABC");

    expect(status).toBe(500);
    expect(frame.err).toBeInstanceOf(Error);
  });

  test("a POST body over maxMessageBytes (default 16 MiB) is refused, and the server keeps answering", async () => {
    const shipped = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "shipped", maxMessageBytes: undefined } });
    // The server answers 413 as soon as the limit is passed and closes the connection; a client
    // still writing its 17 MiB may see the reset before it reads the 413. Either is a refusal.
    const outcome = await fetch(`http://${shipped.host}:${shipped.port}/shipped/ape/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "apeClientId=ABC" },
      body: jss.stringify({ type: "echo", data: { pad: "x".repeat(17 * 1024 * 1024) }, createdAt: new Date() }),
    }).then((res) => res.status, () => "reset");

    expect([413, "reset"]).toContain(outcome);
    expect((await post("echo", { ok: 1 }, "apeClientId=ABC")).frame.data).toEqual({ echo: { ok: 1 } });
  }, 60000); // builds and sends a 17 MiB body: slow on a loaded machine

  test("maxMessageBytes sets the POST limit too", async () => {
    const small = await harness.createServer({ where: dir, apeOptions: { urlPrefix: "small", maxMessageBytes: 1000 } });
    const send = (pad) => fetch(`http://${small.host}:${small.port}/small/ape/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "apeClientId=ABC" },
      body: jss.stringify({ type: "echo", data: { pad }, createdAt: new Date() }),
    });

    expect((await send("x".repeat(200))).status).toBe(200);
    const refused = await send("x".repeat(2000));
    expect(refused.status).toBe(413);
    expect((await refused.json()).error).toMatch(/maxMessageBytes/);
  });

  test("Errors in a returned object arrive with the stack Name: message, no server path", async () => {
    const { frame } = await post("retErr", {}, "apeClientId=ABC");

    expect(frame.data.failed.stack).toBe("Error: returned");
    expect(frame.data.list[0].stack).toBe("TypeError: in a list");
    expect(require("util").inspect(frame, { depth: null })).not.toContain(dir);
  });
});
