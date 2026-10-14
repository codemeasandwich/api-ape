/**
 * @fileoverview Programmatic controllers (api-ape 4.5.0): a server started with a
 * `controllers` map instead of a folder to scan, seen through the public server API.
 *
 * Domain context: `bun build --compile` produces one executable with no controller
 * folder on disk, so `where` (a folder scan with `fs.readdirSync`) cannot work there.
 * The app imports its controllers itself and hands api-ape the map. These stories check
 * that the map behaves exactly like the folder: the same endpoint names, the same
 * refusals, the same `this`.
 *
 * Every test is a user story: a raw WebSocket (or the real `ape()` start-up) is the only
 * way in.
 *
 * @module simulator/scenarios/stories/call-contract/controllers-option
 */

const http = require("http");
const { Harness } = require("../../../harness");
const { connectRaw } = require("./raw-client");

jest.setTimeout(20000);

describe("controllers option", () => {
  let harness;

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 40000, connectTimeout: 10000 });
  });

  afterEach(async () => {
    await harness.cleanup();
    require("../../../../server/lib/fileTransfer").resetFileTransferManager();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  /**
   * Start a server from a controllers map and open a raw socket to it.
   *
   * @param {Object} controllers - Endpoint path to function (or `{ default }`)
   * @param {Object} [extra] - More `ape()` options (`urlPrefix`, ...) and harness options (`onConnect`)
   * @returns {Promise<Object>} The raw client, plus `server`
   */
  async function serve(controllers, extra = {}) {
    const { onConnect, ...apeOptions } = extra;
    const server = await harness.createServer({
      onConnect,
      apeOptions: { where: undefined, controllers, ...apeOptions },
    });
    const raw = await connectRaw(server, (apeOptions.urlPrefix || "api").replace(/^\/+|\/+$/g, ""));
    raw.server = server;
    return raw;
  }

  /**
   * Run `ape()` on a throwaway HTTP server and return what it threw (or null).
   *
   * @param {Object} options - Options for `ape()`
   * @returns {string|null} The start-up error's message
   */
  function startupError(options) {
    const { ape } = require("../../../../server");
    ape._serverApe._resetForTesting();
    try {
      ape(http.createServer(), options);
      return null;
    } catch (err) {
      return err.message;
    }
  }

  describe("a map answers calls like a folder does", () => {
    test("a nested endpoint, a top-level one, and a module namespace (export default) are all served", async () => {
      const raw = await serve({
        "cards/move": (d) => ({ moved: d.id }),
        hello: (name) => `Hello, ${name}!`,
        "users/profile": { default: () => ({ name: "Ada" }) },
      });
      expect((await raw.reply(raw.call("cards/move", { id: 7 }))).data).toEqual({ moved: 7 });
      expect((await raw.reply(raw.call("hello", "World"))).data).toBe("Hello, World!");
      expect((await raw.reply(raw.call("users/profile", {}))).data).toEqual({ name: "Ada" });
      raw.close();
    });

    test("a leading slash on a key and on the call mean the same endpoint", async () => {
      const raw = await serve({ "/cards/move": () => "moved" });
      expect((await raw.reply(raw.call("/cards/move", {}))).data).toBe("moved");
      expect((await raw.reply(raw.call("cards/move", {}))).data).toBe("moved");
      raw.close();
    });

    test("a key ending in /index serves the parent endpoint, as users/index.js does in a folder", async () => {
      const raw = await serve({ "users/index": () => "users-index" });
      expect((await raw.reply(raw.call("users", {}))).data).toBe("users-index");
      raw.close();
    });

    test("`this` is the connection's context: embed from onConnect, clientId, broadcast, publish", async () => {
      const raw = await serve(
        {
          whoami() {
            return { user: this.user, hasClientId: typeof this.clientId === "string", broadcast: typeof this.broadcast, publish: typeof this.publish };
          },
        },
        { onConnect: () => ({ embed: { user: "ada" } }) },
      );
      expect((await raw.reply(raw.call("whoami", {}))).data).toEqual({
        user: "ada",
        hasClientId: true,
        broadcast: "function",
        publish: "function",
      });
      raw.close();
    });

    test("an endpoint that is not in the map is 'not found', including names every object inherits", async () => {
      const raw = await serve({ hello: () => "hi" });
      for (const name of ["nope", "constructor", "valueOf", "__proto__"]) {
        const frame = await raw.reply(raw.call(name, {}));
        expect(String(frame.err.message)).toMatch(/was not found/);
      }
      raw.close();
    });

    test("an endpoint named like an inherited property (constructor) is served when the app lists it", async () => {
      const raw = await serve({ constructor: () => "mine" });
      expect((await raw.reply(raw.call("constructor", {}))).data).toBe("mine");
      raw.close();
    });

    test("endpoints added to the map object after start-up are not served (the map is copied at start)", async () => {
      const map = { hello: () => "hi" };
      const raw = await serve(map);
      map.late = () => "late";
      const frame = await raw.reply(raw.call("late", {}));
      expect(String(frame.err.message)).toMatch(/was not found/);
      raw.close();
    });
  });

  describe("the URL prefix", () => {
    test("defaults to 'api', where the browser client dials", async () => {
      const raw = await serve({ hello: () => "hi" });
      expect((await raw.reply(raw.call("hello", {}))).data).toBe("hi");
      raw.close();
    });

    test("urlPrefix moves it", async () => {
      const raw = await serve({ hello: () => "hi" }, { urlPrefix: "/rpc/" });
      const frame = await raw.reply(raw.call("hello", {}));
      expect(frame.data).toBe("hi");
      raw.close();
    });
  });

  describe("start-up refusals say what is wrong", () => {
    test("both where and controllers: a clear error naming both", () => {
      const message = startupError({ where: "api", controllers: { hello: () => 1 } });
      expect(message).toMatch(/either `where`.*or `controllers`.*not both/);
    });

    test("neither where nor controllers: a clear error naming both", () => {
      const message = startupError({ logging: false });
      expect(message).toMatch(/need `where`.*or `controllers`/);
    });

    test("a value that is not a function stops start-up, naming the endpoint", () => {
      const message = startupError({ controllers: { "cards/move": { not: "a function" } } });
      expect(message).toMatch(/Endpoint "cards\/move".*must export a function, found object/s);
    });

    test("null, a number and a missing default are refused the same way", () => {
      expect(startupError({ controllers: { a: null } })).toMatch(/Endpoint "a".*found null/s);
      expect(startupError({ controllers: { a: 5 } })).toMatch(/Endpoint "a".*found number/s);
      expect(startupError({ controllers: { a: { default: "x" } } })).toMatch(/Endpoint "a".*found object/s);
    });

    test("controllers must be an object keyed by endpoint path", () => {
      expect(startupError({ controllers: [() => 1] })).toMatch(/controllers option must be an object/);
      expect(startupError({ controllers: "api" })).toMatch(/controllers option must be an object/);
      expect(startupError({ controllers: null, where: undefined })).toMatch(/need `where`/);
    });

    test("two keys that name the same endpoint are refused, listing both", () => {
      const message = startupError({ controllers: { users: () => 1, "users/index": () => 2 } });
      expect(message).toMatch(/Duplicate endpoint detected: "users"/);
      expect(message).toMatch(/users\/index/);
      const slash = startupError({ controllers: { users: () => 1, "/users": () => 2 } });
      expect(slash).toMatch(/Duplicate endpoint detected: "users"/);
    });

    test.each([
      ["_private/helper", "private"],
      ["cards/_move", "private"],
      ["index", "index"],
      ["thing.test", "test"],
      ["thing.spec", "test"],
      ["", "empty"],
      ["cards//move", "empty"],
      ["cards/", "empty"],
    ])("the key %j is refused, as the folder scan would never serve it (%s)", (key) => {
      const message = startupError({ controllers: { [key]: () => 1 } });
      expect(message).toMatch(/controllers option/);
      expect(message).toContain(JSON.stringify(key));
    });

    test("the folder path still starts without controllers", () => {
      expect(startupError({ where: "simulator/test-api", logging: false })).toBeNull();
    });
  });

  describe("options that only make sense for a folder", () => {
    test("watch and selector are ignored with a warning naming them; the server starts", () => {
      const warnings = [];
      const message = startupError({
        controllers: { hello: () => 1 },
        watch: true,
        selector: ["js", "ts"],
        logging: { log() {}, info() {}, debug() {}, error() {}, warn: (m) => warnings.push(m) },
      });
      expect(message).toBeNull();
      const line = warnings.find((w) => /"watch"/.test(w));
      expect(line).toMatch(/"selector"/);
      expect(line).toMatch(/only apply to `where`/);
    });

    test("no warning when they are absent", () => {
      const warnings = [];
      startupError({
        controllers: { hello: () => 1 },
        logging: { log() {}, info() {}, debug() {}, error() {}, warn: (m) => warnings.push(m) },
      });
      expect(warnings).toEqual([]);
    });
  });
});
