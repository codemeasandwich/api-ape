/**
 * @fileoverview Subscribe authorisation (api-ape 4.5.0): `onSubscribe` decides who may
 * receive a channel, and `clearLastMessage` stops a channel's retained message from
 * reaching the next subscriber.
 *
 * Domain context: before 4.5.0 any client that could open a socket could send
 * `{ subscribe: 'any/channel' }` and was handed that channel's retained last message at
 * once, so a channel named after a user or a tenant leaked its latest payload to anyone
 * who guessed the name. Each story below is what an app author or a user sees: a raw
 * WebSocket, the real server-side client, and the public server API.
 *
 * @module simulator/scenarios/stories/call-contract/subscribe-authorisation
 */

const WebSocket = require("ws");
const jss = require("../../../../utils/jss");
const { Harness } = require("../../../harness");

jest.setTimeout(20000);

const REFUSED = "__subscribe_refused__";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("subscribe authorisation", () => {
  let harness;
  let publish;
  let clearLastMessage;
  const peers = [];

  /**
   * Start a server (prefix `api`) whose connections embed `{ user }` taken from `?user=`.
   *
   * @param {Object} [apeOptions] - Extra `ape()` options, usually `onSubscribe`
   * @returns {Promise<Object>} The harness server
   */
  async function serve(apeOptions = {}) {
    const server = await harness.createServer({
      apeOptions: { urlPrefix: "api", ...apeOptions },
      onConnect: (socket, req) => ({ embed: { user: new URL(req.url, "http://x").searchParams.get("user") } }),
    });
    ({ publish, clearLastMessage } = require("../../../../server"));
    return server;
  }

  /**
   * Open a raw peer and wait for its greeting.
   *
   * @param {Object} server - Harness server
   * @param {string} [user] - Value the server embeds as `this.user`
   * @param {{clientId?: string, sessionId: string}} [resume] - Send this `sessionId` cookie, and
   *   reconnect as that logical client when `clientId` is given
   * @returns {Promise<Object>} `{ frames, send, subscribe, unsubscribe, framesOn, close, clientId }`
   */
  async function peer(server, user, resume) {
    const query = [user && `user=${user}`, resume && resume.clientId && `resume=${resume.clientId}`].filter(Boolean).join("&");
    const headers = resume ? { Cookie: `sessionId=${resume.sessionId}` } : {};
    const ws = new WebSocket(`${server.wsUrl}/api/ape${query ? `?${query}` : ""}`, { headers });
    const frames = [];
    ws.on("message", (raw) => frames.push(jss.parse(raw.toString())));
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const until = Date.now() + 3000;
    while (!frames.some((f) => f.type === "__connected__") && Date.now() < until) await pause(10);
    const p = {
      ws,
      frames,
      clientId: frames.find((f) => f.type === "__connected__").data.clientId,
      sessionId: frames.find((f) => f.type === "__connected__").data.sessionId,
      subscribe: (channel) => ws.send(JSON.stringify({ subscribe: channel })),
      unsubscribe: (channel) => ws.send(JSON.stringify({ unsubscribe: channel })),
      framesOn: (channel) => frames.filter((f) => f.type === channel),
      refusals: () => frames.filter((f) => f.type === REFUSED),
      close: () => ws.close(),
    };
    peers.push(p);
    return p;
  }

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 40500, connectTimeout: 10000 });
  });

  afterEach(async () => {
    peers.splice(0).forEach((p) => p.close());
    await harness.cleanup();
    await pause(100);
  });

  describe("without onSubscribe nothing changes", () => {
    test("a client subscribes to any channel and gets the retained message at once, then every publish", async () => {
      const server = await serve();
      publish("/anything/at/all", { n: 1 });
      const a = await peer(server);
      a.subscribe("/anything/at/all");
      await pause(150);
      publish("/anything/at/all", { n: 2 });
      await pause(150);
      expect(a.framesOn("/anything/at/all").map((f) => f.data.n)).toEqual([1, 2]);
      expect(a.refusals()).toEqual([]);
    });
  });

  describe("a refused subscription", () => {
    test("gets a refusal frame naming the channel, no retained message and no later publish", async () => {
      const server = await serve({ onSubscribe: () => false });
      publish("/secret/room", { secret: "retained" });
      const a = await peer(server);
      a.subscribe("/secret/room");
      await pause(200);
      publish("/secret/room", { secret: "later" });
      await pause(150);

      expect(a.framesOn("/secret/room")).toEqual([]);
      const [refusal] = a.refusals();
      expect(refusal).toBeDefined();
      expect(refusal.queryId).toBeFalsy();
      expect(refusal.err).toBeInstanceOf(Error);
      expect(refusal.err.message).toBe('Subscription to "/secret/room" refused');
      expect(refusal.errCode).toBe("SUBSCRIBE_REFUSED");
      expect(refusal.errData).toEqual({ channel: "/secret/room" });
      expect(String(refusal.err.stack)).not.toMatch(/\.js:\d+/); // no server path or frame
    });

    test("only the refused channel is refused: the same client may still hold an allowed one", async () => {
      const server = await serve({ onSubscribe: (channel) => channel === "/public" });
      publish("/public", { open: true });
      publish("/private", { open: false });
      const a = await peer(server);
      a.subscribe("/private");
      a.subscribe("/public");
      await pause(200);
      expect(a.framesOn("/public").map((f) => f.data)).toEqual([{ open: true }]);
      expect(a.framesOn("/private")).toEqual([]);
      expect(a.refusals().map((f) => f.errData.channel)).toEqual(["/private"]);
    });

    test("a refusal also drops a subscription the client already held on that channel", async () => {
      let allow = true;
      const server = await serve({ onSubscribe: () => allow });
      const a = await peer(server);
      a.subscribe("/room");
      await pause(150);
      publish("/room", { n: 1 });
      await pause(100);
      expect(a.framesOn("/room")).toHaveLength(1);

      allow = false; // permission revoked; the client subscribes again (as it does on reconnect)
      a.subscribe("/room");
      await pause(150);
      publish("/room", { n: 2 });
      await pause(150);
      expect(a.framesOn("/room")).toHaveLength(1);
      expect(a.refusals()).toHaveLength(1);
    });
  });

  describe("what onSubscribe is asked", () => {
    test("the channel as sent, and the connection's clientId, sessionId and embed", async () => {
      const asked = [];
      const server = await serve({ onSubscribe: (channel, context) => (asked.push({ channel, context }), true) });
      const a = await peer(server, "alice", { sessionId: "app-session-1" });
      a.subscribe("/news/banking");
      await pause(150);
      expect(asked).toHaveLength(1);
      expect(asked[0].channel).toBe("/news/banking");
      expect(asked[0].context.clientId).toBe(a.clientId);
      expect(asked[0].context.sessionId).toBe("app-session-1"); // what controllers see as this.sessionId
      expect(asked[0].context.embed).toEqual({ user: "alice" });
    });

    test("a rule per user: alice reads her own channel and is refused bob's", async () => {
      const server = await serve({
        onSubscribe: (channel, { embed }) => channel === `/user/${embed.user}/inbox`,
      });
      publish("/user/alice/inbox", { to: "alice" });
      publish("/user/bob/inbox", { to: "bob" });
      const alice = await peer(server, "alice");
      alice.subscribe("/user/alice/inbox");
      alice.subscribe("/user/bob/inbox");
      await pause(200);
      expect(alice.framesOn("/user/alice/inbox").map((f) => f.data.to)).toEqual(["alice"]);
      expect(alice.framesOn("/user/bob/inbox")).toEqual([]);
      expect(alice.refusals().map((f) => f.errData.channel)).toEqual(["/user/bob/inbox"]);
    });

    test("it is asked again on every new connection (a reconnect is a new subscribe)", async () => {
      const asked = [];
      const server = await serve({ onSubscribe: (channel) => (asked.push(channel), true) });
      const first = await peer(server);
      first.subscribe("/room");
      await pause(100);
      first.close();
      await pause(100);
      const second = await peer(server);
      second.subscribe("/room");
      await pause(100);
      expect(asked).toEqual(["/room", "/room"]);
    });
  });

  describe("an asynchronous onSubscribe", () => {
    test("the retained message is sent only after the promise resolves true", async () => {
      let release;
      const server = await serve({ onSubscribe: () => new Promise((resolve) => (release = resolve)) });
      publish("/slow", { retained: true });
      const a = await peer(server);
      a.subscribe("/slow");
      await pause(150);
      expect(a.framesOn("/slow")).toEqual([]);
      expect(a.refusals()).toEqual([]);
      release(true);
      await pause(150);
      expect(a.framesOn("/slow").map((f) => f.data)).toEqual([{ retained: true }]);
    });

    test("a client that unsubscribes while the check is pending is never subscribed", async () => {
      let release;
      const server = await serve({ onSubscribe: () => new Promise((resolve) => (release = resolve)) });
      publish("/slow", { retained: true });
      const a = await peer(server);
      a.subscribe("/slow");
      await pause(100);
      a.unsubscribe("/slow");
      await pause(100);
      release(true);
      await pause(150);
      publish("/slow", { later: true });
      await pause(150);
      expect(a.framesOn("/slow")).toEqual([]);
    });

    test("a second subscribe supersedes a pending first: the later answer decides", async () => {
      const resolvers = [];
      const server = await serve({ onSubscribe: () => new Promise((resolve) => resolvers.push(resolve)) });
      const a = await peer(server);
      a.subscribe("/slow");
      a.subscribe("/slow");
      await pause(150);
      expect(resolvers).toHaveLength(2);
      resolvers[1](false);
      await pause(100);
      resolvers[0](true); // the stale answer arrives late and must not subscribe the client
      await pause(100);
      publish("/slow", { n: 1 });
      await pause(150);
      expect(a.framesOn("/slow")).toEqual([]);
      expect(a.refusals()).toHaveLength(1);
    });

    test("a client that disconnects while the check is pending leaves no subscription behind", async () => {
      let release;
      const server = await serve({ onSubscribe: () => new Promise((resolve) => (release = resolve)) });
      const a = await peer(server);
      a.subscribe("/slow");
      await pause(100);
      a.close();
      await pause(150);
      release(true); // the answer arrives after the socket is gone
      await pause(100);
      // The same logical client reconnects (resume). A subscription left behind for its
      // clientId would hand it this publish without it ever subscribing.
      const again = await peer(server, undefined, { clientId: a.clientId, sessionId: a.sessionId });
      expect(again.clientId).toBe(a.clientId);
      publish("/slow", { n: 1 });
      await pause(150);
      expect(again.framesOn("/slow")).toEqual([]);
    });
  });

  describe("a guard that cannot answer fails closed", () => {
    test.each([
      ["throws", () => { throw new Error("db password is hunter2"); }],
      ["rejects", () => Promise.reject(new Error("db password is hunter2"))],
      ["returns nothing", () => {}],
      ["returns a truthy non-boolean", () => "yes"],
      ["returns a Promise of undefined", () => Promise.resolve(undefined)],
      ["throws a string", () => { throw "hunter2 as text"; }],
      ["rejects with nothing", () => Promise.reject()],
    ])("onSubscribe that %s: the client is refused, and the message does not leak the cause", async (_name, guard) => {
      const logged = [];
      const server = await serve({ onSubscribe: guard });
      // The harness resets logging after it starts a server, so set the sink afterwards.
      require("../../../../utils/apeLogger").configureApeLogging({
        log() {}, info() {}, debug() {}, warn() {}, error: (...a) => logged.push(a.join(" ")),
      });
      publish("/guarded", { secret: 1 });
      const a = await peer(server);
      a.subscribe("/guarded");
      await pause(200);
      expect(a.framesOn("/guarded")).toEqual([]);
      expect(a.refusals()).toHaveLength(1);
      expect(JSON.stringify(a.refusals()[0])).not.toContain("hunter2");
      if (_name === "throws" || _name === "rejects" || _name === "throws a string") expect(logged.join("\n")).toContain("hunter2");
      if (_name === "rejects with nothing") expect(logged.join("\n")).toContain("refusing");
    });

    test("a channel that is not a string is refused when a guard is set", async () => {
      const asked = [];
      const server = await serve({ onSubscribe: (channel) => (asked.push(channel), true) });
      const a = await peer(server);
      a.ws.send(JSON.stringify({ subscribe: { toString: "x" } }));
      a.ws.send(JSON.stringify({ subscribe: 42 }));
      await pause(200);
      expect(asked).toEqual([]);
      expect(a.refusals()).toHaveLength(2);
    });
  });

  describe("start-up", () => {
    test("an onSubscribe that is not a function stops start-up", async () => {
      await expect(serve({ onSubscribe: "yes" })).rejects.toThrow(/onSubscribe must be a function/);
    });
  });

  describe("the server-side client", () => {
    test("api.channel(callback, onError) reports a refusal to onError and never calls the callback", async () => {
      const server = await serve({ onSubscribe: (channel) => channel === "/open" });
      publish("/open", { ok: 1 });
      publish("/closed", { ok: 0 });
      const { api } = require("../../../../server");
      api.connect(server.host, server.port);
      try {
        const seen = [];
        const errors = [];
        api.open((data) => seen.push(["open", data]), (err) => errors.push(["open", err]));
        api.closed((data) => seen.push(["closed", data]), (err) => errors.push(["closed", err]));
        await pause(500);
        publish("/closed", { ok: -1 });
        await pause(200);
        expect(seen).toEqual([["open", { ok: 1 }]]);
        expect(errors).toHaveLength(1);
        const [channelName, err] = errors[0];
        expect(channelName).toBe("closed");
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe("SUBSCRIBE_REFUSED");
        expect(err.data).toEqual({ channel: "/closed" });
        expect(err.message).toBe('Subscription to "/closed" refused');
      } finally {
        api.close();
      }
    });

    test("a refusal reaches every subscriber of the channel, and a later unsubscribe is harmless", async () => {
      const server = await serve({ onSubscribe: () => false });
      const { api } = require("../../../../server");
      api.connect(server.host, server.port);
      try {
        const errors = [];
        const off1 = api.room(() => {}, (e) => errors.push(["one", e.code]));
        const off2 = api.room(() => {}, (e) => errors.push(["two", e.code]));
        await pause(500);
        expect(errors.sort()).toEqual([["one", "SUBSCRIBE_REFUSED"], ["two", "SUBSCRIBE_REFUSED"]]);
        off1();
        off2();
        off1();
      } finally {
        api.close();
      }
    });

    test("asking again after a refusal delivers each publish once; the refused callback hears nothing later", async () => {
      let allow = false;
      const server = await serve({ onSubscribe: () => allow });
      const { api, publish: publishNow } = require("../../../../server");
      api.connect(server.host, server.port, { logging: false });
      try {
        const calls = [];
        const refused = [];
        const first = (d) => calls.push(["first", d.n]);
        api.room(first, (e) => refused.push(e.code));
        await pause(500);
        expect(refused).toEqual(["SUBSCRIBE_REFUSED"]);

        allow = true; // permission granted; the docs say: call api.channel(...) again to ask again
        api.room(first, (e) => refused.push(`again:${e.code}`));
        const second = (d) => calls.push(["second", d.n]);
        api.room(second);
        await pause(500);
        publishNow("/room", { n: 1 });
        await pause(300);
        expect(calls.sort()).toEqual([["first", 1], ["second", 1]]); // once each, never twice
        expect(refused).toEqual(["SUBSCRIBE_REFUSED"]);
      } finally {
        api.close();
      }
    });

    test("a refusal that was already in flight when the client left and asked again leaves client and server agreeing", async () => {
      const { WebSocketServer } = require("ws");
      const fake = new WebSocketServer({ port: 0, host: "127.0.0.1" });
      await new Promise((resolve) => fake.once("listening", resolve));
      const received = [];
      const sockets = [];
      fake.on("connection", (ws) => {
        sockets.push(ws);
        ws.on("message", (raw) => received.push(JSON.parse(raw.toString())));
      });
      const { api } = require("../../../../server");
      api.connect("127.0.0.1", fake.address().port, { logging: false });
      try {
        const told = [];
        const calls = [];
        const off = api.room(() => {}, () => told.push("left"));
        await pause(300);
        off(); // the client leaves ...
        api.room((d) => calls.push(d), (e) => told.push(e.code)); // ... and asks again
        await pause(200);
        // ... while the server's refusal of the FIRST ask is still on its way.
        sockets[0].send(
          jss.stringify({
            err: new Error('Subscription to "/room" refused'),
            type: REFUSED,
            queryId: false,
            errCode: "SUBSCRIBE_REFUSED",
            errData: { channel: "/room" },
          }),
        );
        await pause(200);
        sockets[0].send(jss.stringify({ type: "/room", data: { n: 1 }, queryId: false }));
        await pause(200);
        expect(told).toEqual(["SUBSCRIBE_REFUSED"]); // the one still subscribed is told; the one who left is not
        expect(calls).toEqual([]); // the client no longer holds the subscription ...
        expect(received[received.length - 1]).toEqual({ unsubscribe: "/room" }); // ... and says so, so the server drops any it granted
      } finally {
        api.close();
        await new Promise((resolve) => fake.close(resolve));
      }
    });

    test("without an error callback a refusal is logged, not thrown", async () => {
      const server = await serve({ onSubscribe: () => false });
      const { api } = require("../../../../server");
      const warned = [];
      api.connect(server.host, server.port, {
        logging: { log() {}, info() {}, debug() {}, error() {}, warn: (...a) => warned.push(a.join(" ")) },
      });
      try {
        api.room(() => {});
        await pause(500);
        expect(warned.join("\n")).toContain('Subscription to "/room" refused');
      } finally {
        api.close();
      }
    });
  });

  describe("HTTP streaming", () => {
    test("a client on the long-poll path cannot subscribe at all, so onSubscribe has nothing to guard", async () => {
      const asked = [];
      const server = await serve({ onSubscribe: (channel) => (asked.push(channel), true) });
      const base = `http://${server.host}:${server.port}/api/ape/poll`;
      const stream = new AbortController();
      const res = await fetch(base, { signal: stream.signal });
      const cookie = String(res.headers.get("set-cookie")).split(";")[0];
      const chunks = [];
      (async () => {
        try {
          for await (const chunk of res.body) chunks.push(Buffer.from(chunk).toString());
        } catch (_) { /* aborted */ }
      })();
      publish("/news", { retained: true });
      const post = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: jss.stringify({ subscribe: "/news" }),
      });
      await post.text();
      publish("/news", { later: true });
      await pause(300);
      stream.abort();
      expect(asked).toEqual([]);
      expect(chunks.join("")).not.toContain("retained");
      expect(chunks.join("")).not.toContain("later");
    });
  });

  describe("clearLastMessage", () => {
    test("a subscriber who arrives after the clear gets no retained message; one who was subscribed still got the publish", async () => {
      const server = await serve();
      const early = await peer(server);
      early.subscribe("/dm/ada");
      await pause(100);
      publish("/dm/ada", { text: "private" });
      clearLastMessage("/dm/ada");
      const late = await peer(server);
      late.subscribe("/dm/ada");
      await pause(200);
      expect(early.framesOn("/dm/ada").map((f) => f.data.text)).toEqual(["private"]);
      expect(late.framesOn("/dm/ada")).toEqual([]);
    });

    test("the next publish is retained again, and clearing a channel nobody published to is harmless", async () => {
      const server = await serve();
      expect(() => clearLastMessage("/never/used")).not.toThrow();
      publish("/again", { n: 1 });
      clearLastMessage("/again");
      publish("/again", { n: 2 });
      const a = await peer(server);
      a.subscribe("/again");
      await pause(200);
      expect(a.framesOn("/again").map((f) => f.data.n)).toEqual([2]);
    });

    test("ape.clearLastMessage and this.clearLastMessage in a controller are the same call", async () => {
      const server = await harness.createServer({
        apeOptions: {
          urlPrefix: "api",
          where: undefined,
          controllers: { forget() { this.clearLastMessage("/a"); return "cleared"; } },
        },
      });
      const { ape } = require("../../../../server");
      ape.publish("/a", { n: 1 });
      ape.publish("/b", { n: 2 });
      ape.clearLastMessage("/b");
      const a = await peer(server);
      a.subscribe("/a");
      a.subscribe("/b");
      await pause(150);
      expect(a.framesOn("/a")).toHaveLength(1); // retained until the controller clears it
      expect(a.framesOn("/b")).toEqual([]);
      const b = await peer(server);
      const queryId = require("../../../../utils/messageHash");
      const message = jss.stringify({ type: "forget", data: {}, createdAt: new Date(), requestedAt: new Date() });
      b.ws.send(message);
      await pause(200);
      expect(b.frames.some((f) => f.queryId === queryId(message) && f.data === "cleared")).toBe(true);
      const c = await peer(server);
      c.subscribe("/a");
      await pause(150);
      expect(c.framesOn("/a")).toEqual([]);
    });
  });
});
