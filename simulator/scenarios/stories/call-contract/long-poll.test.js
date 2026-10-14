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
  "who.js": "module.exports = function () { return { clientId: this.clientId, sessionId: this.sessionId }; };",
  "context.js": `module.exports = function () {
    this.keepalive();
    this.broadcast('shout', { from: this.clientId });
    this.send('private', { ok: true });
    this.send('failure', undefined, Object.assign(new TypeError('pushed'), { code: 'P' }));
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
    await readFor("failure");

    expect(frame.data.hasOthers).toBe("function");
    const frames = seen.split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => jss.parse(line.slice(6)));
    expect(frames.some((f) => f._keepalive === true && f.queryId === frame.queryId)).toBe(true);
    expect(frames.some((f) => f.type === "shout")).toBe(true);
    expect(frames.some((f) => f.type === "private" && f.data.ok === true)).toBe(true);
    const failure = frames.find((f) => f.type === "failure");
    expect(failure.err).toBeInstanceOf(TypeError);
    expect(failure.err.stack).toBe("TypeError: pushed");
    expect(failure.errCode).toBe("P");
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
});
