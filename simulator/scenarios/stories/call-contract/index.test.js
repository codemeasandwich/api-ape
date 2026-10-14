/**
 * @fileoverview Call-contract stories (api-ape 4.3.1): what a caller can rely on when it
 * makes a call, seen through the public server API and a raw socket.
 *
 * Every test is a user story. The page-side halves of these stories (the real browser
 * client) live in `integration/bun/client-*.ts`; this file covers what the SERVER
 * promises on the wire.
 *
 * @module simulator/scenarios/stories/call-contract
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Harness } = require("../../../harness");
const { connectRaw } = require("./raw-client");

jest.setTimeout(20000);

const FIXTURES = path.resolve(__dirname, "../../../test-api-contract");

/**
 * Write controller files into a fresh temp directory and return it.
 *
 * @param {Object<string, string>} files - Relative path to file contents
 * @returns {string} The directory, to pass as the server's `where`
 */
function writeControllers(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-contract-"));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), source);
  }
  return dir;
}

describe("Call contract", () => {
  let harness;
  const tempDirs = [];
  afterAll(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  /**
   * Controllers written for one test.
   *
   * @param {Object<string, string>} files - Relative path to file contents
   * @returns {string} Directory to serve
   */
  const controllers = (files) => {
    const dir = writeControllers(files);
    tempDirs.push(dir);
    return dir;
  };

  /**
   * Serve controllers written for one test and open a raw socket to them.
   *
   * @param {Object<string, string>} files - Relative path to file contents
   * @param {Object} [options] - Extra harness server options (e.g. `selector`)
   * @returns {Promise<Object>} The raw client
   */
  const serveRaw = async (files, options = {}) => {
    const where = controllers(files);
    const server = await harness.createServer({ where, apeOptions: { urlPrefix: "contract" }, ...options });
    return connectRaw(server, "contract");
  };

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 36000, connectTimeout: 10000 });
  });

  afterEach(async () => {
    await harness.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("keepalive", () => {
    test("two slow calls at once: each keepalive frame carries its own call's id and each call gets one reply", async () => {
      const server = await harness.createServer({ where: FIXTURES });
      const raw = await connectRaw(server);

      const a = raw.call("slow", { n: 3, ms: 150, tag: "A" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const b = raw.call("slow", { n: 2, ms: 150, tag: "B" });

      const [replyA, replyB] = await Promise.all([raw.reply(a), raw.reply(b)]);
      expect(replyA.data).toEqual({ done: true, tag: "A", rounds: 3 });
      expect(replyB.data).toEqual({ done: true, tag: "B", rounds: 2 });

      // A's three keepalives and B's two, each on the right id, none lost to the other call.
      expect(raw.framesFor(a).filter((f) => f._keepalive)).toHaveLength(3);
      expect(raw.framesFor(b).filter((f) => f._keepalive)).toHaveLength(2);
      // Exactly one reply frame per call.
      expect(raw.framesFor(a).filter((f) => !f._keepalive)).toHaveLength(1);
      expect(raw.framesFor(b).filter((f) => !f._keepalive)).toHaveLength(1);
      raw.close();
    });
  });
  describe("identical calls", () => {
    test("a service calling the same endpoint three times in one millisecond gets three replies", async () => {
      // The server-side client (`api.connect`) dials `/api/ape`, so mount under `api`.
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api" } });
      const { api } = require("../../../../server");
      api.connect(server.host, server.port);
      try {
        const replies = await Promise.all([1, 2, 3].map(() => api.echo({ same: "payload" })));
        expect(replies).toEqual([
          { echo: { same: "payload" } },
          { echo: { same: "payload" } },
          { echo: { same: "payload" } },
        ]);
      } finally {
        api.close();
      }
    });
  });
  describe("replies", () => {
    test("a controller that returns nothing still answers: the caller gets a reply whose data is undefined", async () => {
      const server = await harness.createServer({ where: FIXTURES });
      const raw = await connectRaw(server);

      const reply = await raw.reply(raw.call("voidret", {}));

      expect(reply.err).toBeUndefined();
      expect(reply.data).toBeUndefined();
      raw.close();
    });
  });
  describe("errors", () => {
    const ERRORS = {
      "boom.js": `module.exports = function (d) {
        if (d.kind === 'type') throw new TypeError('wrong type');
        if (d.kind === 'coded') throw Object.assign(new Error('conflict'), { code: 'CONFLICT', data: { current: 3 } });
        if (d.kind === 'string') throw 'plain string';
        if (d.kind === 'bigint') throw Object.assign(new Error('unserialisable'), { code: 'BIG', data: { n: 10n } });
        if (d.kind === 'shaped') throw { name: 'ShapedError', message: 'not an Error instance' };
        if (d.kind === 'nameless') throw { message: 'only a message' };
        if (d.kind === 'number') throw 42;
        throw new Error('generic');
      };`,
    };

    test("a controller that throws a TypeError: the caller gets a TypeError with the message and no server stack", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "type" }));

      expect(frame.err).toBeInstanceOf(TypeError);
      expect(frame.err.name).toBe("TypeError");
      expect(frame.err.message).toBe("wrong type");
      expect(frame.err.stack).toBe("TypeError: wrong type"); // no file paths of the server
      raw.close();
    });

    test("a controller error carrying code and data: the frame carries both next to the error", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "coded" }));

      expect(frame.err.message).toBe("conflict");
      expect(frame.errCode).toBe("CONFLICT");
      expect(frame.errData).toEqual({ current: 3 });
      raw.close();
    });

    test("a controller that throws a string: the caller gets an Error carrying that string", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "string" }));

      expect(frame.err).toBeInstanceOf(Error);
      expect(frame.err.message).toBe("plain string");
      raw.close();
    });

    test("a controller that throws an Error-shaped object: its name and message arrive", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "shaped" }));

      expect(frame.err.name).toBe("ShapedError");
      expect(frame.err.message).toBe("not an Error instance");
      raw.close();
    });

    test("a controller that throws an object with only a message: it arrives as a plain Error", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "nameless" }));

      expect(frame.err.name).toBe("Error");
      expect(frame.err.message).toBe("only a message");
      raw.close();
    });

    test("a controller that throws a value with no message (a number): the value itself arrives", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "number" }));

      expect(frame.err).toBe(42);
      raw.close();
    });

    test("a service calling another service gets the Error with its class, code and data", async () => {
      const where = controllers(ERRORS);
      const server = await harness.createServer({ where, apeOptions: { urlPrefix: "api" } });
      const { api } = require("../../../../server");
      api.connect(server.host, server.port);
      try {
        const failed = await api.boom({ kind: "coded" }).then(() => null, (e) => e);
        expect(failed).toBeInstanceOf(Error);
        expect(failed.message).toBe("conflict");
        expect(failed.code).toBe("CONFLICT");
        expect(failed.data).toEqual({ current: 3 });

        // An error with no code or data arrives without them, not as `undefined` properties set.
        const plain = await api.boom({ kind: "generic" }).then(() => null, (e) => e);
        expect(plain.message).toBe("generic");
        expect("code" in plain).toBe(false);
        expect("data" in plain).toBe(false);
      } finally {
        api.close();
      }
    });

    test("error data that cannot be serialised does not lose the reply: the error arrives without the data", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("boom", { kind: "bigint" }));

      expect(frame.err.message).toBe("unserialisable");
      expect(frame.errCode).toBe("BIG");
      expect(frame.errData).toBeUndefined();
      raw.close();
    });

    test("a call to an endpoint that does not exist: the caller gets a not-found error", async () => {
      const raw = await serveRaw(ERRORS);

      const frame = await raw.reply(raw.call("nope", {}));

      expect(frame.err.message).toContain('"nope" was not found');
      raw.close();
    });
  });

  describe("controller files", () => {
    test("a controller written as export default is called like any other", async () => {
      const raw = await serveRaw({
        "esm.js": `exports.__esModule = true; exports.default = function (d) { return { viaDefault: d }; };`,
      });

      const frame = await raw.reply(raw.call("esm", { a: 1 }));

      expect(frame.err).toBeUndefined();
      expect(frame.data).toEqual({ viaDefault: { a: 1 } });
      raw.close();
    });

    test("type declaration files and test files in the controller folder are not endpoints", async () => {
      const raw = await serveRaw(
        {
          "real.js": `module.exports = function () { return 'real'; };`,
          "real.d.ts": `export declare function real(): string;`,
          "real.test.js": `throw new Error('a test file must never be loaded as a controller');`,
          "real.spec.js": `throw new Error('a spec file must never be loaded as a controller');`,
        },
        { selector: ["js", "ts"] },
      );

      const frame = await raw.reply(raw.call("real", {}));
      const declared = await raw.reply(raw.call("real.d", {}));

      expect(frame.data).toBe("real");
      expect(declared.err.message).toContain("was not found");
      raw.close();
    });

    test("a controller file that exports something that is not a function stops startup naming the file", async () => {
      const where = controllers({
        "ok.js": `module.exports = function () { return 1; };`,
        "settings.js": `module.exports = { retries: 3 };`,
      });

      await expect(harness.createServer({ where })).rejects.toThrow(/settings\.js.*function|"settings".*function/s);
    });

    test("a controller file that exports null stops startup naming the file", async () => {
      const where = controllers({ "nothing.js": `module.exports = null;` });

      await expect(harness.createServer({ where })).rejects.toThrow(/nothing.*found null/s);
    });

    test("a controller file that exports a default which is not a function stops startup naming the file", async () => {
      const where = controllers({
        "weird.js": `exports.__esModule = true; exports.default = 42;`,
      });

      await expect(harness.createServer({ where })).rejects.toThrow(/weird/);
    });
  });
  describe("context", () => {
    test("a controller can push to everyone with this.broadcast and to everyone but the caller with this.broadcastOthers", async () => {
      const server = await harness.createServer({ where: FIXTURES });
      const caller = await connectRaw(server);
      const other = await connectRaw(server);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await caller.reply(caller.call("announce", { text: "hello" }));
      await new Promise((resolve) => setTimeout(resolve, 150));

      const types = (raw) => raw.frames.map((f) => f.type).filter((t) => t === "shout" || t === "whisper");
      expect(types(caller)).toEqual(["shout"]); // the caller hears the shout, not the whisper
      expect(types(other).sort()).toEqual(["shout", "whisper"]);
      caller.close();
      other.close();
    });
  });

  describe("options", () => {
    const quiet = (warn) => ({ log() {}, info() {}, debug() {}, error() {}, warn });

    test("a server started with authFramework refuses to start instead of leaving endpoints unauthenticated", async () => {
      await expect(
        harness.createServer({ where: FIXTURES, apeOptions: { authFramework: { createSocketAuth() {} } } }),
      ).rejects.toThrow(/"authFramework" option is not supported/);
    });

    test("a server started with authMiddleware refuses to start", async () => {
      await expect(
        harness.createServer({ where: FIXTURES, apeOptions: { authMiddleware: { check() {} } } }),
      ).rejects.toThrow(/"authMiddleware" option is not supported/);
    });

    test("a mistyped option still starts the server and is named in a warning", async () => {
      const warn = jest.fn();
      await harness.createServer({ where: FIXTURES, apeOptions: { logging: quiet(warn), wher: "typo" } });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"wher"'));
    });

    test("apeBun refuses authFramework and authMiddleware too, and sends its warnings to the logging option it is given", () => {
      const { apeBun } = require("../../../../server/lib/bun");
      expect(() => apeBun({ where: FIXTURES, authFramework: {} })).toThrow(/"authFramework" option is not supported/);
      expect(() => apeBun({ where: FIXTURES, authMiddleware: {} })).toThrow(/"authMiddleware" option is not supported/);

      const warn = jest.fn();
      apeBun({ where: FIXTURES, logging: quiet(warn), urlPrefixx: "typo" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"urlPrefixx"'));
    });
  });
  describe("server-side client subscriptions", () => {
    test("a service that subscribes with api.news.banking(cb) receives what the other server publishes until it unsubscribes", async () => {
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api" } });
      const { api, publish } = require("../../../../server");
      const got = [];
      api.connect(server.host, server.port);
      try {
        // Subscribed before the socket is open: sent when it opens.
        const off = api.news.banking((data) => got.push(data));
        await harness.waitFor(() => api.transport === "websocket", 3000);
        await new Promise((resolve) => setTimeout(resolve, 100));

        publish("/news/banking", { n: 1 });
        await harness.waitFor(() => got.length === 1, 2000);

        // A second local subscriber shares the one server-side subscription.
        const second = [];
        const offSecond = api.news.banking((data) => second.push(data));
        publish("/news/banking", { n: 2 });
        await harness.waitFor(() => got.length === 2 && second.length === 1, 2000);

        offSecond();
        offSecond(); // safe to call twice
        off(); // last local subscriber: the server-side subscription is dropped
        await new Promise((resolve) => setTimeout(resolve, 100));
        publish("/news/banking", { n: 3 });
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(got.map((d) => d.n)).toEqual([1, 2]);
        expect(second.map((d) => d.n)).toEqual([2]);
      } finally {
        api.close();
      }
    });
  });
});
