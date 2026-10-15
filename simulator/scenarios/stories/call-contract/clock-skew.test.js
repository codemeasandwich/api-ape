/**
 * @fileoverview Clock skew (api-ape 4.5.1): a client whose clock is a little ahead of the
 * server's is no longer refused, and the bundled clients stamp calls in the server's clock.
 *
 * Domain context: the docs promised "tolerance for minor clock skew" but 4.5.0 refused a call
 * whose `createdAt` was even 1 ms ahead of the server's `Date.now()`, with an error frame and
 * no data. A browser whose clock runs a little fast had every call refused. Now the server
 * accepts a lead of up to `maxClockSkewMs` (default 5000), sends its time in the
 * `__connected__` frame (`serverTime`), and the clients stamp `createdAt` in that clock.
 * The 10 s staleness window and the replay protection stay.
 *
 * Every test is a user story: a raw WebSocket peer (what the server promises on the wire),
 * the real server-side client against a real server, and the real server-side client against
 * a fake server whose clock and greeting the story controls (what a client does with them).
 * The page-side halves, with the real browser client, are in `integration/bun/client-clock-skew.ts`.
 *
 * @module simulator/scenarios/stories/call-contract/clock-skew
 */

const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const jss = require("../../../../utils/jss");
const messageHash = require("../../../../utils/messageHash");
const { Harness } = require("../../../harness");
const { connectRaw } = require("./raw-client");

jest.setTimeout(30000);

const FIXTURES = path.resolve(__dirname, "../../../test-api-contract");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("clock skew", () => {
  let harness;
  const closers = [];

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 41000, connectTimeout: 10000 });
  });

  afterEach(async () => {
    closers.splice(0).forEach((close) => close());
    await harness.cleanup();
    require("../../../../server/lib/fileTransfer").resetFileTransferManager();
    await pause(100);
  });

  /**
   * Start a server over the contract fixtures (`echo`) and open a raw socket to it.
   *
   * @param {Object} [apeOptions] - Extra `ape()` options (`maxClockSkewMs`, ...)
   * @returns {Promise<Object>} The raw client, plus `server`
   */
  async function serve(apeOptions = {}) {
    const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api", ...apeOptions } });
    const raw = await connectRaw(server, "api");
    closers.push(raw.close);
    raw.server = server;
    return raw;
  }

  /**
   * Make one raw call stamped `offsetMs` from the server's clock and wait for its reply.
   *
   * @param {Object} raw - From `serve`
   * @param {number} offsetMs - Positive: ahead of the server; negative: behind
   * @returns {Promise<Object>} The reply frame
   */
  async function callAt(raw, offsetMs) {
    return raw.reply(raw.call("echo", { at: offsetMs }, Date.now() + offsetMs));
  }

  describe("what the server accepts", () => {
    test("a call stamped a few seconds ahead of the server's clock is answered, not refused", async () => {
      const raw = await serve();

      for (const ahead of [1, 1000, 4000]) {
        const frame = await callAt(raw, ahead);
        expect(frame.err).toBeFalsy();
        expect(frame.data).toEqual({ echo: { at: ahead } });
      }
    });

    test("a call stamped well ahead is refused with an error frame that says by how much and which option", async () => {
      const raw = await serve();

      const queryId = raw.call("echo", { at: "far" }, Date.now() + 8000);
      const frame = await raw.reply(queryId);

      expect(frame.queryId).toBe(queryId);
      expect(frame.err).toBeInstanceOf(Error);
      expect(frame.err.message).toMatch(/createdAt ahead of server by (7|8)(\.\d+)? secs/);
      expect(frame.err.message).toContain("accepts up to 5 secs");
      expect(frame.err.message).toContain("maxClockSkewMs");
      expect(frame.data).toBeUndefined(); // no data, only the refusal
    });

    test("a refused call never reaches its controller", async () => {
      let ran = 0;
      const server = await harness.createServer({
        apeOptions: { where: undefined, controllers: { count: () => ++ran }, urlPrefix: "api" },
      });
      const raw = await connectRaw(server, "api");
      closers.push(raw.close);

      await raw.reply(raw.call("count", {}, Date.now() + 60000));
      await raw.reply(raw.call("count", {}, Date.now() + 1000));

      expect(ran).toBe(1);
    });

    test("maxClockSkewMs sets how far ahead is accepted: 30 s accepts 20 s and refuses 40 s", async () => {
      const raw = await serve({ maxClockSkewMs: 30000 });

      expect((await callAt(raw, 20000)).data).toEqual({ echo: { at: 20000 } });
      expect(String((await callAt(raw, 40000)).err.message)).toContain("accepts up to 30 secs");
    });

    test("maxClockSkewMs: 0 keeps the 4.5.0 behaviour of refusing any call stamped ahead", async () => {
      const raw = await serve({ maxClockSkewMs: 0 });

      expect(String((await callAt(raw, 250)).err.message)).toMatch(/createdAt ahead of server/);
      expect((await callAt(raw, -10)).data).toEqual({ echo: { at: -10 } });
    });

    test.each([[-1], ["5000"], [NaN], [Infinity], [null]])(
      "a maxClockSkewMs of %p stops start-up instead of refusing every call later",
      async (value) => {
        await expect(harness.createServer({ where: FIXTURES, apeOptions: { maxClockSkewMs: value } })).rejects.toThrow(
          /maxClockSkewMs must be a number of milliseconds, 0 or more/,
        );
        const { apeBun } = require("../../../../server/lib/bun");
        expect(() => apeBun({ where: FIXTURES, maxClockSkewMs: value })).toThrow(/maxClockSkewMs must be a number/);
      },
    );
  });

  describe("what stays as it was", () => {
    test("a call 9 s old is answered and one 11 s old is refused as old (the 10 s window is unchanged)", async () => {
      const raw = await serve();

      expect((await callAt(raw, -9000)).data).toEqual({ echo: { at: -9000 } });
      expect(String((await callAt(raw, -11000)).err.message)).toMatch(/request is old by (10|11)(\.\d+)? secs/);
    });

    test("a replayed call is refused even when it was stamped ahead, and a different call still goes through", async () => {
      const raw = await serve();
      const frameText = JSON.stringify({ type: "echo", data: { once: true }, "createdAt<!D>": Date.now() + 3000 });

      const first = raw.callRaw(frameText);
      expect((await raw.reply(first)).data).toEqual({ echo: { once: true } });
      const again = raw.callRaw(frameText); // the same bytes: the same queryId
      await pause(300);
      const replies = raw.framesFor(again).filter((frame) => !frame._keepalive);

      expect(replies).toHaveLength(2);
      expect(String(replies[1].err.message)).toMatch(/Duplicate request rejected/);
      expect((await callAt(raw, 3000)).data).toEqual({ echo: { at: 3000 } });
    });
  });

  describe("the server's time in the connected frame", () => {
    test("a WebSocket greeting carries serverTime, the server's Date.now() in epoch milliseconds", async () => {
      const before = Date.now();
      const raw = await serve();
      await pause(50);
      const greeting = raw.frames.find((frame) => frame.type === "__connected__");

      expect(greeting.data.clientId).toEqual(expect.any(String));
      expect(greeting.data.serverTime).toEqual(expect.any(Number));
      expect(greeting.data.serverTime).toBeGreaterThanOrEqual(before);
      expect(greeting.data.serverTime).toBeLessThanOrEqual(Date.now());
    });

    test("the HTTP long-poll stream's greeting carries serverTime too", async () => {
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "poll" } });
      const abort = new AbortController();
      closers.push(() => abort.abort());
      const before = Date.now();

      const stream = await fetch(`http://${server.host}:${server.port}/poll/ape/poll`, { signal: abort.signal });
      const reader = stream.body.getReader();
      let seen = "";
      const until = Date.now() + 3000;
      while (!seen.includes("\n\n") && Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += Buffer.from(value).toString("utf8");
      }
      const greeting = jss.parse(seen.split("\n\n")[0].replace(/^data: /, ""));

      expect(greeting.type).toBe("__connected__");
      expect(greeting.data.serverTime).toBeGreaterThanOrEqual(before);
      expect(greeting.data.serverTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("the server-side client", () => {
    /**
     * A stand-in server whose clock and greeting a story controls. It records the `createdAt`
     * of every call (as epoch ms) and answers each call with `{ ok: true }`.
     *
     * @param {Object} behaviour
     * @param {function(): (number|undefined)} behaviour.serverTime - What the greeting says; `undefined`
     *   leaves `serverTime` out (an older server)
     * @param {boolean} [behaviour.greet=true] - Send the `__connected__` frame at all
     * @param {function(string, string): *} [behaviour.reply] - `(message, queryId) => frame` to answer with instead
     * @returns {Promise<{port: number, stamps: number[], sockets: WebSocket[], behaviour: Object}>} The stand-in
     */
    async function fakeServer(behaviour) {
      behaviour = { greet: true, ...behaviour };
      const wss = new WebSocket.Server({ port: 0, host: "127.0.0.1" });
      await new Promise((resolve) => wss.once("listening", resolve));
      const stamps = [];
      const sockets = [];
      wss.on("connection", (ws) => {
        sockets.push(ws);
        if (behaviour.greet) {
          const serverTime = behaviour.serverTime();
          const data = { clientId: "C1", sessionId: "S1", ...(serverTime === undefined ? {} : { serverTime }) };
          ws.send(jss.stringify({ type: "__connected__", data, queryId: false, err: false }));
        }
        ws.on("message", (raw) => {
          const message = raw.toString();
          const queryId = messageHash(message);
          const parsed = jss.parse(message);
          if (parsed.createdAt) stamps.push(Number(parsed.createdAt)); // a Date (browser) or a number (server-side client)
          ws.send(behaviour.reply ? behaviour.reply(message, queryId) : jss.stringify({ data: { ok: true }, type: parsed.type, queryId, err: false }));
        });
      });
      closers.push(() => {
        sockets.forEach((ws) => ws.terminate());
        wss.close();
      });
      return { port: wss.address().port, stamps, sockets, behaviour };
    }

    /**
     * Run a story with the real server-side client, and close it afterwards.
     *
     * @param {function(Object): Promise<void>} story - Receives the client's `api`
     * @returns {Promise<void>}
     */
    async function withClient(story) {
      const { api } = require("../../../../server");
      try {
        await story(api);
      } finally {
        api.close();
      }
    }

    const HOUR = 3600 * 1000;

    test("a call to a server whose clock is a minute ahead is stamped in the server's clock", async () => {
      const fake = await fakeServer({ serverTime: () => Date.now() + 60000 });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        await api.ping({ n: 1 }); // the first call waits in the queue until the greeting is in
        await api.ping({ n: 2 }); // the second goes straight out

        for (const stamp of fake.stamps) expect(Math.abs(stamp - (Date.now() + 60000))).toBeLessThan(3000);
        expect(fake.stamps).toHaveLength(2);
      });
    });

    test("a call to a server whose clock is an hour behind is stamped in the server's clock, not 3600 s old", async () => {
      const fake = await fakeServer({ serverTime: () => Date.now() - HOUR });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        await api.ping({});
        await api.ping({});

        for (const stamp of fake.stamps) expect(Math.abs(stamp - (Date.now() - HOUR))).toBeLessThan(3000);
      });
    });

    test("calls made while the client is still connecting go out together, in order, in the server's clock", async () => {
      const fake = await fakeServer({ serverTime: () => Date.now() + 60000 });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        const answers = await Promise.all([api.ping({ n: 1 }), api.ping({ n: 2 }), api.ping({ n: 3 })]);

        expect(answers).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
        expect(fake.stamps).toHaveLength(3);
        fake.stamps.forEach((stamp) => expect(Math.abs(stamp - (Date.now() + 60000))).toBeLessThan(3000));
        expect([...fake.stamps].sort((a, b) => a - b)).toEqual(fake.stamps);
      });
    });

    test("an older server that sends no serverTime keeps the old behaviour: stamps in the client's own clock", async () => {
      const fake = await fakeServer({ serverTime: () => undefined });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        await api.ping({});
        await api.ping({});

        for (const stamp of fake.stamps) expect(Math.abs(stamp - Date.now())).toBeLessThan(3000);
      });
    });

    test("a serverTime that is not a number is ignored: the client stamps in its own clock", async () => {
      const fake = await fakeServer({ serverTime: () => "soon" });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        await api.ping({});
        await api.ping({});

        for (const stamp of fake.stamps) expect(Math.abs(stamp - Date.now())).toBeLessThan(3000);
      });
    });

    test("a server that never greets does not stall a queued call: it goes out about a second after the socket opens", async () => {
      const fake = await fakeServer({ serverTime: () => undefined, greet: false });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        const began = Date.now();
        await api.ping({});

        expect(Date.now() - began).toBeGreaterThanOrEqual(800);
        expect(Date.now() - began).toBeLessThan(4000);
        expect(Math.abs(fake.stamps[0] - Date.now())).toBeLessThan(3000);
      });
    });

    test("after a reconnect the client uses the new greeting's clock, so a server that sends none gets the client's own", async () => {
      let skew = 90000;
      const fake = await fakeServer({ serverTime: () => (skew === null ? undefined : Date.now() + skew) });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });
        await api.ping({ first: true });
        skew = null; // the next greeting has no time
        fake.sockets[0].terminate();
        const until = Date.now() + 8000;
        while (fake.sockets.length < 2 && Date.now() < until) await pause(50);
        await pause(100);
        await api.ping({ second: true });

        expect(Math.abs(fake.stamps[0] - (Date.now() + 90000))).toBeLessThan(3000);
        expect(Math.abs(fake.stamps[1] - Date.now())).toBeLessThan(3000);
      });
    });

    test("a refusal frame from the server rejects the caller's promise with the server's message", async () => {
      const refusal = "createdAt ahead of server by 7 secs (the server accepts up to 5 secs: maxClockSkewMs). Request rejected.";
      const fake = await fakeServer({
        serverTime: () => Date.now(),
        reply: (message, queryId) => jss.stringify({ err: new Error(refusal), type: "ping", queryId }),
      });
      await withClient(async (api) => {
        api.connect("127.0.0.1", fake.port, { logging: false });

        const outcome = await api.ping({}).then(
          (value) => ({ resolved: value }),
          (err) => ({ rejected: err }),
        );

        expect("resolved" in outcome).toBe(false);
        expect(outcome.rejected).toBeInstanceOf(Error);
        expect(outcome.rejected.message).toBe(refusal);
      });
    });

    test("against a real server on the same clock, the first call (queued while connecting) and later ones are answered", async () => {
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api" } });
      await withClient(async (api) => {
        api.connect(server.host, server.port, { logging: false });

        expect(await api.echo({ n: 1 })).toEqual({ echo: { n: 1 } });
        expect(await api.echo({ n: 2 })).toEqual({ echo: { n: 2 } });
      });
    });

    test("when the server's clock is wrong by more than it allows, the real server's refusal reaches the caller as a rejection", async () => {
      // A client that learned the wrong clock (here: a greeting 60 s behind the real server)
      // stamps its calls 60 s old; the real server refuses them and the caller must see why.
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api" } });
      const proxy = http.createServer();
      const relay = new WebSocket.Server({ server: proxy });
      relay.on("connection", (client, req) => {
        const upstream = new WebSocket(`ws://${server.host}:${server.port}${req.url}`);
        const pending = [];
        upstream.on("open", () => pending.splice(0).forEach((m) => upstream.send(m)));
        client.on("message", (m) => (upstream.readyState === 1 ? upstream.send(m.toString()) : pending.push(m.toString())));
        upstream.on("message", (m) => {
          const text = m.toString();
          const frame = jss.parse(text);
          if (frame.type === "__connected__") frame.data.serverTime -= 60000; // the proxy lies about the time
          client.send(frame.type === "__connected__" ? jss.stringify(frame) : text);
        });
        client.on("close", () => upstream.close());
      });
      await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
      closers.push(() => {
        relay.clients.forEach((c) => c.terminate());
        relay.close();
        proxy.close();
      });
      await withClient(async (api) => {
        api.connect("127.0.0.1", proxy.address().port, { logging: false });

        const outcome = await api.echo({ n: 1 }).then(
          (value) => ({ resolved: value }),
          (err) => ({ rejected: err }),
        );

        expect("resolved" in outcome).toBe(false);
        expect(String(outcome.rejected.message)).toMatch(/request is old by (59|60)(\.\d+)? secs/);
      });
    });
  });
});
