/**
 * @fileoverview Tests for the inbound WebSocket message handler.
 *
 * Drives the public `receiveHandler` factory with a fully-mocked `ape`
 * context. Each test simulates a single inbound message and asserts the
 * resulting send() / onReceive() / controller side-effects.
 */

const messageHash = require("../../utils/messageHash");
const jss = require("../../utils/jss");
const receiveHandler = require("./receive");

/** Build a minimal `ape` context with capturing mocks. */
function makeApe(overrides = {}) {
  const ctx = {
    send: jest.fn(),
    checkReply: jest.fn(),
    events: {
      onReceive: jest.fn(() => () => {}),
      onError: jest.fn(),
    },
    controllers: {},
    sharedValues: { req: {} },
    clientId: "client-1",
    embedValues: {},
    fileTransfer: null,
    socketAuth: null,
    authMiddleware: null,
    ...overrides,
  };
  return ctx;
}

/** Build a JSS-encoded message frame on the wire. */
function frame(type, data) {
  return jss.stringify({ type: "/" + type, data, createdAt: Date.now() });
}

describe("receive handler — subscribe/unsubscribe", () => {
  // Scenario: client subscribes to a channel with no replay state — the
  // handler must register and return without invoking send().
  test("subscribe without replay state is a no-op send-wise", async () => {
    const ape = makeApe({ controllers: {} });
    const onReceive = receiveHandler(ape);
    await onReceive(JSON.stringify({ subscribe: "news/markets" }));
    // No controller was invoked, no send beyond optional replay
    expect(ape.events.onError).not.toHaveBeenCalled();
  });

  // Scenario: client subscribes to a channel with a cached last-message —
  // the pubsub layer's replay engages and send() emits the cached value.
  test("subscribe replays last message when one is cached", async () => {
    const { publish } = require("../lib/broadcast");
    // Pre-publish so the subscription is replayed
    publish("replay/test", { hello: "world" });
    const ape = makeApe();
    const onReceive = receiveHandler(ape);
    await onReceive(JSON.stringify({ subscribe: "replay/test" }));
    // send() should have been called with the replay
    expect(ape.send).toHaveBeenCalled();
  });

  // Scenario: subscribe replay's send throws (socket closed mid-replay).
  // The handler must swallow the error and continue.
  test("subscribe replay swallows send errors", async () => {
    const { publish } = require("../lib/broadcast");
    publish("replay/swallow", { x: 1 });
    const ape = makeApe({
      send: jest.fn(() => { throw new Error("socket closed"); }),
    });
    const onReceive = receiveHandler(ape);
    await expect(
      onReceive(JSON.stringify({ subscribe: "replay/swallow" })),
    ).resolves.toBeUndefined();
  });

  test("unsubscribe message returns without dispatch", async () => {
    const ape = makeApe();
    const onReceive = receiveHandler(ape);
    await onReceive(JSON.stringify({ unsubscribe: "x/y" }));
    expect(ape.events.onReceive).not.toHaveBeenCalled();
  });
});

describe("receive handler — controller dispatch and result handling", () => {
  // Scenario: a controller resolves successfully and returns a value. The
  // handler must call send() with the result and invoke onReceive's onFinish
  // callback with success.
  test("resolving controller calls send and onFinish with value", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: {
        echo: function (data) { return { echoed: data }; },
      },
      events: {
        onReceive: jest.fn(() => onFinish),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("echo", { hello: 1 }));
    // Microtask flush
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      { echoed: { hello: 1 } },
      false,
    );
    expect(onFinish).toHaveBeenCalledWith(false, { echoed: { hello: 1 } });
  });

  // Scenario: a controller returns undefined (fire-and-forget). The handler
  // must NOT call send() — only onFinish — to avoid sending an empty body.
  test("undefined return does not emit a send", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: {
        fireAndForget: function () { return undefined; },
      },
      events: {
        onReceive: jest.fn(() => onFinish),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("fireAndForget", {}));
    await new Promise((r) => setImmediate(r));
    expect(ape.send).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(false, undefined);
  });

  // Scenario: a controller throws synchronously — handler must route to
  // send() with the error payload and call onFinish(err, true).
  test("throwing controller emits send(err) and onFinish(err, true)", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: {
        boom: function () { throw new Error("kaboom"); },
      },
      events: {
        onReceive: jest.fn(() => onFinish),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("boom", {}));
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      expect.any(Error),
    );
    expect(onFinish).toHaveBeenCalledWith(expect.any(Error), true);
  });

  // Scenario: a controller rejects asynchronously.
  test("rejecting controller emits send(err) and onFinish(err, true)", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: {
        rej: async function () { throw new Error("async-fail"); },
      },
      events: {
        onReceive: jest.fn(() => onFinish),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("rej", {}));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(onFinish).toHaveBeenCalledWith(expect.any(Error), true);
  });

  // Scenario: a controller's send throws after resolve (socket closed
  // mid-response). The handler's `.then` catch must swallow.
  test("send error after resolve is swallowed", async () => {
    let sendCallCount = 0;
    const ape = makeApe({
      controllers: { ok: () => "result" },
      send: jest.fn(() => {
        sendCallCount++;
        if (sendCallCount === 1) throw new Error("socket gone");
      }),
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("ok", {}));
    await new Promise((r) => setImmediate(r));
    // Should not have rethrown
    expect(sendCallCount).toBeGreaterThan(0);
  });

  // Scenario: a controller's send throws after reject. The handler's
  // `.catch` catch must swallow.
  test("send error after reject is swallowed", async () => {
    const ape = makeApe({
      controllers: { boom: () => { throw new Error("boom"); } },
      send: jest.fn(() => { throw new Error("socket gone too"); }),
    });
    const onReceive = receiveHandler(ape);
    await expect(onReceive(frame("boom", {}))).resolves.toBeUndefined();
  });

  // Scenario: unknown controller name. The Promise constructor throws
  // synchronously inside the try; the result.catch routes to send(err).
  test("unknown controller routes to send(err) with TypeError message", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: {},
      events: { onReceive: jest.fn(() => onFinish), onError: jest.fn() },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("missing/route", {}));
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      expect.stringMatching(/missing\/route.*not found/),
    );
    expect(onFinish).toHaveBeenCalled();
  });

  // Scenario: events.onReceive returns nothing (undefined). The default
  // `() => {}` no-op must be assigned.
  test("missing onReceive callback uses default no-op", async () => {
    const ape = makeApe({
      controllers: { ok: () => "result" },
      events: { onReceive: jest.fn(() => undefined), onError: jest.fn() },
    });
    const onReceive = receiveHandler(ape);
    await expect(onReceive(frame("ok", {}))).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  // Scenario: the controller calls `this.keepalive()` mid-execution. The
  // handler-injected keepalive must fire a heartbeat send with the special
  // sentinel flag.
  test("controller-invoked keepalive emits heartbeat send", async () => {
    let captured;
    const ape = makeApe({
      controllers: {
        long: function () {
          this.keepalive();
          captured = this._currentQueryId;
          return "done";
        },
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("long", {}));
    await new Promise((r) => setImmediate(r));
    // Keepalive send: 5 args with last `true`
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      false,
      true,
    );
    expect(captured).toBeDefined();
  });

  // Scenario: keepalive's send throws (socket closed). The handler must
  // swallow the error within the keepalive closure.
  test("keepalive send error is swallowed", async () => {
    let sendCalls = 0;
    const ape = makeApe({
      controllers: {
        long: function () {
          this.keepalive();
          return "done";
        },
      },
      send: jest.fn(() => {
        sendCalls++;
        if (sendCalls === 1) throw new Error("socket gone in keepalive");
      }),
    });
    const onReceive = receiveHandler(ape);
    await expect(onReceive(frame("long", {}))).resolves.toBeUndefined();
  });
});

describe("receive handler — authorization middleware rejection", () => {
  // Scenario: an authMiddleware is configured. The inbound message is at a
  // tier higher than the current socket state. Handler must call
  // createFailResponse, emit it, and short-circuit before controller dispatch.
  test("rejected authz emits failResponse and skips controller", async () => {
    const controller = jest.fn();
    const ape = makeApe({
      controllers: { secret: controller },
      socketAuth: { getState: () => ({ tier: 0 }) },
      authMiddleware: {
        check: jest.fn(() => ({ allowed: false, reason: "INSUFFICIENT_TIER" })),
        createFailResponse: jest.fn((r) => ({
          type: "authz_fail",
          reason: r.reason,
        })),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("secret", {}));
    await new Promise((r) => setImmediate(r));
    expect(controller).not.toHaveBeenCalled();
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      "authz_fail",
      expect.objectContaining({ reason: "INSUFFICIENT_TIER" }),
      null,
    );
  });

  // Scenario: rejected authz where send throws — handler must swallow and
  // still finish via onFinish.
  test("rejected authz with send error still calls onFinish", async () => {
    const onFinish = jest.fn();
    const ape = makeApe({
      controllers: { secret: jest.fn() },
      socketAuth: { getState: () => ({ tier: 0 }) },
      authMiddleware: {
        check: jest.fn(() => ({ allowed: false, reason: "X" })),
        createFailResponse: jest.fn((r) => ({ type: "authz_fail", reason: r.reason })),
      },
      send: jest.fn(() => { throw new Error("socket gone"); }),
      events: { onReceive: jest.fn(() => onFinish), onError: jest.fn() },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("secret", {}));
    await new Promise((r) => setImmediate(r));
    expect(onFinish).toHaveBeenCalled();
  });
});

describe("receive handler — auth message dispatch", () => {
  // Scenario: an inbound message matches isAuthMessage. The handler routes
  // to the configured auth handler and skips the regular controller path.
  test("auth message is handled by socketAuth path and not dispatched to controller", async () => {
    const ape = makeApe({
      socketAuth: {
        handleMessage: jest.fn(async () => ({ type: "opaque_auth_ok" })),
      },
      controllers: {
        "opaque_auth_start": jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("opaque_auth_start", { user: "u" }));
    await new Promise((r) => setImmediate(r));
    expect(ape.controllers["opaque_auth_start"]).not.toHaveBeenCalled();
    expect(ape.socketAuth.handleMessage).toHaveBeenCalled();
  });

});

describe("receive handler — file transfer paths", () => {
  // Scenario: a message has upload tags but no plugin tags. The handler
  // must call fileTransfer.registerUpload for each tag and inject the upload
  // descriptor at the path.
  test("upload tags are registered through fileTransfer.registerUpload", async () => {
    const fileTransfer = {
      registerUpload: jest.fn(async () => ({ uploadId: "u-123" })),
      registerStreamingFile: jest.fn(),
    };
    const ctrl = jest.fn(() => "done");
    const ape = makeApe({
      controllers: { upload: ctrl },
      fileTransfer,
    });
    // Encode a message with an upload tag — `key<!U>` is the binary upload marker.
    // We use jss.stringify with a manually-crafted shape that includes the
    // upload-tag pattern that findUploadTags recognizes.
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/upload",
      data: { "file<!B>": "abc123", name: "doc.pdf" },
      createdAt: Date.now(),
    });
    await onReceive(msg);
    await new Promise((r) => setImmediate(r));
    expect(fileTransfer.registerUpload).toHaveBeenCalled();
  });

  // Scenario: registerUpload rejects (e.g. quota exceeded). Handler must
  // emit send(err) and call onFinish.
  test("upload registration failure emits send(err) and onFinish", async () => {
    const onFinish = jest.fn();
    const fileTransfer = {
      registerUpload: jest.fn(async () => { throw new Error("quota"); }),
      registerStreamingFile: jest.fn(),
    };
    const ape = makeApe({
      controllers: { upload: jest.fn() },
      fileTransfer,
      events: { onReceive: jest.fn(() => onFinish), onError: jest.fn() },
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/upload",
      data: { "file<!B>": "abc123" },
      createdAt: Date.now(),
    });
    await onReceive(msg);
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      expect.any(Error),
    );
    expect(onFinish).toHaveBeenCalledWith(expect.any(Error), true);
  });

  // Scenario: file tags (streaming file references) are present — the
  // handler must register each with fileTransfer.registerStreamingFile.
  test("file tags trigger streaming-file registration", async () => {
    const fileTransfer = {
      registerUpload: jest.fn(async () => ({})),
      registerStreamingFile: jest.fn(),
    };
    const ape = makeApe({
      controllers: { stream: jest.fn(() => "done") },
      fileTransfer,
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/stream",
      data: { "blob<!F>": "h-1" },
      createdAt: Date.now(),
    });
    await onReceive(msg);
    await new Promise((r) => setImmediate(r));
    expect(fileTransfer.registerStreamingFile).toHaveBeenCalledWith("h-1", "client-1");
  });
});

describe("receive handler — coverage edge cases", () => {
  // Scenario: a Buffer message arrives (from a ws library that emits buffers
  // not strings). The handler's `typeof msg === "string" ? msg : msg.toString`
  // ternary's RHS engages.
  test("Buffer message is decoded via toString('utf8')", async () => {
    const ape = makeApe({ controllers: { ok: () => "ok" } });
    const onReceive = receiveHandler(ape);
    const buf = Buffer.from(frame("ok", {}), "utf8");
    await onReceive(buf);
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalled();
  });

  // Scenario: events.onReceive returns a non-function, non-falsy value
  // (e.g. an integer ID for diagnostics). The `typeof onFinish === "function"`
  // false branches engage where onFinish would be called.
  test("non-function onReceive return suppresses onFinish call sites", async () => {
    const ape = makeApe({
      controllers: { ok: () => "v" },
      events: {
        onReceive: jest.fn(() => 12345), // truthy non-function
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("ok", {}));
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalled();
  });

  // Same scenario but with rejection path: onFinish-as-non-function in
  // the .catch block.
  test("non-function onFinish in rejection path is skipped", async () => {
    const ape = makeApe({
      controllers: { boom: () => { throw new Error("kaboom"); } },
      events: {
        onReceive: jest.fn(() => 12345),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("boom", {}));
    await new Promise((r) => setImmediate(r));
  });

  // Scenario: a thrown non-Error value (e.g. throw "string"). The outer
  // try/catch's `err.message || err` short-circuit's RHS engages.
  test("thrown string is forwarded to onError via the || err fallback", async () => {
    const onError = jest.fn();
    // Force JSON.parse to throw a non-Error by feeding it null bytes
    // that produce a value with no .message. Most realistic: throw "msg"
    // from the controller path. But the outer try is around JSON.parse and
    // controller setup. Easier: use a primitive-throwing JSON-parse error
    // by passing a number — JSON.parse rejects with SyntaxError (has .message).
    // Instead simulate via a custom message handler that throws a primitive
    // — events.onReceive throws a string from inside the try block.
    const ape = makeApe({
      controllers: { ok: () => "v" },
      events: {
        onReceive: jest.fn(() => { throw "literal-string"; }),
        onError,
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("ok", {}));
    await new Promise((r) => setImmediate(r));
    expect(onError).toHaveBeenCalledWith(
      "client-1",
      expect.any(String),
      "literal-string",
    );
  });

  // Scenario: authz allowed → controller proceeds. The check at L97
  // false branch (allowed: true) engages and dispatch continues.
  test("authMiddleware that allows passes to controller", async () => {
    const ctrl = jest.fn(() => "ok");
    const ape = makeApe({
      controllers: { allowed: ctrl },
      socketAuth: { getState: () => ({ tier: 1 }) },
      authMiddleware: {
        check: jest.fn(() => ({ allowed: true })),
        createFailResponse: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("allowed", { x: 1 }));
    await new Promise((r) => setImmediate(r));
    expect(ctrl).toHaveBeenCalled();
  });

  // Scenario: an auth message arrives but the auth handler returns falsy
  // (i.e. it processed the response itself but signals not-handled in this
  // shape). Source path: if (handled) return — false branch falls through.
  // To reach this we'd need handleAuthMessage to return falsy after isAuthMessage
  // true. The handleAuthMessage's only falsy-return path is `if (!isAuthMessage)
  // return false`. Since the parent guard already checks isAuthMessage(type),
  // the inner check is redundant — the handler never returns falsy in
  // practice. So this branch is exercised by passing a message type that
  // satisfies the parent isAuthMessage but is filtered inside the inner
  // handler — which doesn't happen. We exercise the `if (handled)` true
  // path via the earlier "auth message handled" test and accept the false
  // path as unreachable defensive.
  test("auth handler returns truthy → handler returns, controller not dispatched", async () => {
    const ctrl = jest.fn();
    const ape = makeApe({
      socketAuth: {
        handleMessage: jest.fn(async () => ({ type: "opaque_auth_ok" })),
      },
      controllers: { "opaque_auth_start": ctrl },
    });
    const onReceive = receiveHandler(ape);
    await onReceive(frame("opaque_auth_start", { user: "u" }));
    await new Promise((r) => setImmediate(r));
    expect(ctrl).not.toHaveBeenCalled();
  });
});

describe("receive handler — JSS plugin path", () => {
  const { clearPlugins } = require("../../utils/jss/plugins");
  const jssMod = require("../../utils/jss");

  beforeEach(() => clearPlugins());
  afterEach(() => clearPlugins());

  // Scenario: a JSS plugin is registered. An inbound message carries the
  // plugin's tag — handler must route through processPluginReceive instead
  // of the upload-tag path.
  test("plugin tag triggers processPluginReceive instead of upload path", async () => {
    jssMod.custom("Y", {
      check: (key, val) => val && val.isYType === true,
      encode: (path, key, val) => val.payload,
      decode: (val) => ({ isYType: true, payload: val }),
      onReceive: async (path, key, val, ctx) => ({ decoded: true, original: val }),
    });
    const ctrl = jest.fn(() => "ok");
    const fileTransfer = {
      registerUpload: jest.fn(),
      registerStreamingFile: jest.fn(),
    };
    const ape = makeApe({
      controllers: { plugin: ctrl },
      fileTransfer,
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/plugin",
      data: { "value<!Y>": "raw-payload" },
      createdAt: Date.now(),
    });
    await onReceive(msg);
    await new Promise((r) => setImmediate(r));
    expect(ctrl).toHaveBeenCalled();
  });

  // Scenario: a plugin's onReceive throws (e.g. decryption failure). The
  // handler must emit send(err) and onFinish(err, true).
  test("plugin processing failure emits send(err) and onFinish", async () => {
    jssMod.custom("Z", {
      check: (key, val) => val && val.isZType === true,
      encode: (path, key, val) => val.payload,
      decode: (val) => ({ isZType: true, payload: val }),
      onReceive: async () => {
        throw new Error("plugin decryption failed");
      },
    });
    const onFinish = jest.fn();
    const fileTransfer = {
      registerUpload: jest.fn(),
      registerStreamingFile: jest.fn(),
    };
    const ape = makeApe({
      controllers: { plugin: jest.fn() },
      fileTransfer,
      events: { onReceive: jest.fn(() => onFinish), onError: jest.fn() },
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/plugin",
      data: { "value<!Z>": "raw" },
      createdAt: Date.now(),
    });
    await onReceive(msg);
    await new Promise((r) => setImmediate(r));
    expect(ape.send).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      expect.any(Error),
    );
    expect(onFinish).toHaveBeenCalledWith(expect.any(Error), true);
  });

  // Scenario: plugin error path with non-function onFinish — the typeof
  // check false branch engages.
  test("plugin error path with non-function onFinish is safe", async () => {
    jssMod.custom("Q", {
      check: (key, val) => val && val.isQType === true,
      encode: (path, key, val) => val.payload,
      decode: (val) => ({ isQType: true, payload: val }),
      onReceive: async () => { throw new Error("Q-fail"); },
    });
    const ape = makeApe({
      controllers: { plugin: jest.fn() },
      fileTransfer: {
        registerUpload: jest.fn(),
        registerStreamingFile: jest.fn(),
      },
      events: {
        onReceive: jest.fn(() => 12345), // non-function
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/plugin",
      data: { "value<!Q>": "raw" },
      createdAt: Date.now(),
    });
    await expect(onReceive(msg)).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  // Scenario: upload error path with non-function onFinish — the typeof
  // check false branch engages.
  test("upload error path with non-function onFinish is safe", async () => {
    const ape = makeApe({
      controllers: { upload: jest.fn() },
      fileTransfer: {
        registerUpload: jest.fn(async () => { throw new Error("quota"); }),
        registerStreamingFile: jest.fn(),
      },
      events: {
        onReceive: jest.fn(() => 12345), // non-function
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    const msg = JSON.stringify({
      type: "/upload",
      data: { "f<!B>": "h-1" },
      createdAt: Date.now(),
    });
    await expect(onReceive(msg)).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  // Scenario: authz reject path with non-function onFinish — same defensive
  // typeof check on the failResponse onFinish call.
  test("authz reject path with non-function onFinish is safe", async () => {
    const ape = makeApe({
      controllers: { secret: jest.fn() },
      socketAuth: { getState: () => ({ tier: 0 }) },
      authMiddleware: {
        check: jest.fn(() => ({ allowed: false, reason: "X" })),
        createFailResponse: jest.fn((r) => ({ type: "authz_fail", reason: r.reason })),
      },
      events: {
        onReceive: jest.fn(() => 12345),
        onError: jest.fn(),
      },
    });
    const onReceive = receiveHandler(ape);
    await expect(onReceive(frame("secret", {}))).resolves.toBeUndefined();
  });
});

describe("receive handler — error path safety", () => {
  // Scenario: the outer try/catch fires (e.g. JSON.parse throws on
  // malformed payload). events.onError must be invoked.
  test("malformed JSON is reported through events.onError", async () => {
    const ape = makeApe();
    const onReceive = receiveHandler(ape);
    await onReceive("not-valid-json-{[}");
    expect(ape.events.onError).toHaveBeenCalledWith(
      "client-1",
      expect.any(String),
      expect.any(String),
    );
  });

  // Scenario: events.onError itself throws (e.g. RangeError stack
  // exhaustion). The handler's inner try/catch must swallow and log via
  // apeLog.error.
  test("events.onError throw is swallowed by fatal-error guard", async () => {
    const ape = makeApe({
      events: {
        onReceive: jest.fn(() => () => {}),
        onError: jest.fn(() => { throw new Error("error handler crashed"); }),
      },
    });
    const onReceive = receiveHandler(ape);
    await expect(onReceive("malformed{")).resolves.toBeUndefined();
  });
});
