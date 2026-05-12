/**
 * @fileoverview Tests for the WebSocket send-handler factory.
 *
 * The handler is a closure over the socket + events; each test creates a
 * fresh socket mock and drives the public callable. Tests focus on the
 * keepalive path, binary/plugin processing paths, and the binary-count
 * logging branches that aren't reached by the regular request/response
 * scenarios in the simulator stories.
 */

const sendHandlerFactory = require("./send");

function fakeSocket() {
  return {
    readyState: 1, // OPEN
    OPEN: 1,
    send: jest.fn(),
  };
}

function makeApe(overrides = {}) {
  return {
    socket: fakeSocket(),
    events: {
      onSend: jest.fn(() => () => {}),
    },
    clientId: "c1",
    fileTransfer: null,
    ...overrides,
  };
}

describe("send handler — keepalive", () => {
  // Scenario: a long-running controller calls `this.keepalive()`. The send
  // handler emits a minimal `{ queryId, _keepalive: true }` frame so the
  // client's RPC timeout timer resets.
  test("keepalive emits a minimal _keepalive frame", () => {
    const ape = makeApe();
    const send = sendHandlerFactory(ape);
    send("Q123", false, false, false, true);
    expect(ape.socket.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ape.socket.send.mock.calls[0][0]);
    expect(sent.queryId).toBe("Q123");
    expect(sent._keepalive).toBe(true);
  });

  // Scenario: keepalive on a closed socket. checkSocketState throws inside
  // the keepalive's try/catch — handler must swallow.
  test("keepalive on closed socket is a silent no-op", () => {
    const ape = makeApe({
      socket: { readyState: 3, OPEN: 1, send: jest.fn() }, // 3 = CLOSED
    });
    const send = sendHandlerFactory(ape);
    expect(() => send("Q123", false, false, false, true)).not.toThrow();
  });

  // Scenario: keepalive called without queryId — defensive guard at L401
  // short-circuits and the keepalive frame is NOT emitted.
  test("keepalive without queryId is ignored", () => {
    const ape = makeApe();
    const send = sendHandlerFactory(ape);
    // _keepalive=true but no queryId → falls through to regular send path
    // (which then bails because no data/err/queryId/type combination).
    send(null, "/topic", "payload", false, true);
    // Regular send was attempted (not keepalive frame)
    expect(ape.socket.send).toHaveBeenCalled();
    const sent = JSON.parse(ape.socket.send.mock.calls[0][0]);
    expect(sent._keepalive).toBeUndefined();
  });
});

describe("send handler — binary processing", () => {
  // Scenario: data contains binary buffers — the legacy processBinaryData
  // path engages and registers downloads. The `binaryEntries.length > 0`
  // log branch must fire.
  test("legacy binary processing logs registered downloads", () => {
    const fileTransfer = {
      registerDownload: jest.fn(() => "dl-id-1"),
    };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send("Q1", false, { file: Buffer.from("hello") }, false);
    expect(fileTransfer.registerDownload).toHaveBeenCalled();
    expect(ape.socket.send).toHaveBeenCalled();
  });

  // Scenario: same but with no binary data — the log branch's FALSE side
  // (no log) engages.
  test("no binary data in payload skips the binary log", () => {
    const fileTransfer = {
      registerDownload: jest.fn(),
    };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send("Q2", false, { plain: "object" }, false);
    expect(fileTransfer.registerDownload).not.toHaveBeenCalled();
    expect(ape.socket.send).toHaveBeenCalled();
  });
});

describe("send handler — JSS plugin path", () => {
  const { clearPlugins } = require("../../utils/jss/plugins");
  const jssMod = require("../../utils/jss");

  beforeEach(() => clearPlugins());
  afterEach(() => clearPlugins());

  // Scenario: a JSS plugin is registered with an onSend hook. The send
  // handler routes through processPluginSend instead of the legacy binary
  // processor. The plugin's binaryCount triggers the registration log.
  test("plugin path increments binaryCount and logs", () => {
    jssMod.custom("K", {
      check: (key, val) => Buffer.isBuffer(val),
      encode: (path, key, val) => "encoded",
      decode: (val) => val,
      onSend: (path, key, val, ctx) => {
        ctx.fileTransfer.registerDownload(ctx.queryId, val, ctx.clientId);
        return { hash: "h", size: val.length };
      },
    });
    const fileTransfer = {
      registerDownload: jest.fn(() => "dl-id-K"),
    };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send("QK", false, { file: Buffer.from("hello") }, false);
    expect(fileTransfer.registerDownload).toHaveBeenCalled();
    expect(ape.socket.send).toHaveBeenCalled();
  });

  // Scenario: plugin path with no binary tags in the payload — binaryCount
  // is 0 and the log branch's FALSE side engages.
  test("plugin path with no binary content skips the registration log", () => {
    jssMod.custom("L", {
      check: (key, val) => Buffer.isBuffer(val),
      encode: (path, key, val) => "encoded",
      decode: (val) => val,
      onSend: () => ({ hash: "h" }),
    });
    const fileTransfer = {
      registerDownload: jest.fn(),
    };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    // Payload contains no Buffer → plugin's check fails → binaryCount=0
    send("QL", false, { plain: "object" }, false);
    expect(fileTransfer.registerDownload).not.toHaveBeenCalled();
  });
});

describe("send handler — error frames", () => {
  // Scenario: send an error response to a query. Frame must include `err`
  // with `err.message` (or the string form if no message).
  test("error with .message uses err.message", () => {
    const ape = makeApe();
    const send = sendHandlerFactory(ape);
    send("Q-err", null, null, new Error("nope"));
    const sent = JSON.parse(ape.socket.send.mock.calls[0][0]);
    expect(sent.err).toBe("nope");
    expect(sent.queryId).toBe("Q-err");
  });

  // Scenario: send a non-Error err (e.g. throw "string"). The
  // `err.message || err` short-circuit's RHS engages.
  test("error without .message uses the err value directly", () => {
    const ape = makeApe();
    const send = sendHandlerFactory(ape);
    send("Q-err2", null, null, "plain-string-error");
    const sent = JSON.parse(ape.socket.send.mock.calls[0][0]);
    expect(sent.err).toBe("plain-string-error");
  });
});

describe("send handler — broadcast with binary data", () => {
  const { clearPlugins } = require("../../utils/jss/plugins");
  const jssMod = require("../../utils/jss");

  beforeEach(() => clearPlugins());
  afterEach(() => clearPlugins());

  // Scenario: a broadcast (no queryId, only type) carrying a binary payload.
  // The legacy binary processor registers downloads keyed by `type` because
  // queryId is null — exercises the `queryId || type` short-circuit's RHS at
  // the registerDownload + log path.
  test("legacy: broadcast (no queryId) uses type for binary registration", () => {
    const fileTransfer = { registerDownload: jest.fn(() => "dl-b1") };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send(null, "topic-bcast", { file: Buffer.from("hi") }, false);
    expect(fileTransfer.registerDownload).toHaveBeenCalled();
    expect(ape.socket.send).toHaveBeenCalled();
  });

  // Scenario: same broadcast-with-binary case but via the JSS plugin path.
  // Exercises `queryId || type` short-circuit inside the plugin context build
  // and the binary-count log template.
  test("plugin: broadcast (no queryId) uses type for plugin context", () => {
    jssMod.custom("N", {
      check: (key, val) => Buffer.isBuffer(val),
      encode: (path, key, val) => "encoded",
      decode: (val) => val,
      onSend: (path, key, val, ctx) => {
        ctx.fileTransfer.registerDownload(ctx.queryId, val, ctx.clientId);
        return { hash: "h", size: val.length };
      },
    });
    const fileTransfer = { registerDownload: jest.fn(() => "dl-b2") };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send(null, "topic-bcast-plugin", { file: Buffer.from("hi") }, false);
    expect(fileTransfer.registerDownload).toHaveBeenCalled();
  });
});

describe("send handler — isBinaryData null/undefined", () => {
  // Scenario: the legacy processBinaryData walks the payload object and calls
  // isBinaryData on each value. When a property is explicitly null/undefined,
  // isBinaryData must return false without throwing.
  test("payload containing null/undefined values does not crash", () => {
    const fileTransfer = { registerDownload: jest.fn() };
    const ape = makeApe({ fileTransfer });
    const send = sendHandlerFactory(ape);
    send("Q-null", false, { a: null, b: undefined, c: "ok" }, false);
    expect(ape.socket.send).toHaveBeenCalled();
  });
});

describe("send handler — broadcast onSend hook", () => {
  // Scenario: a broadcast (no queryId) with an onSend hook. The hook must
  // be invoked with (data, type), and its returned cleanup function is
  // called after delivery.
  test("broadcast invokes onSend hook and its cleanup callback", () => {
    const cleanup = jest.fn();
    const onSend = jest.fn(() => cleanup);
    const ape = makeApe({ events: { onSend } });
    const send = sendHandlerFactory(ape);
    send(null, "topic", { hello: 1 }, false);
    expect(onSend).toHaveBeenCalledWith({ hello: 1 }, "topic");
    expect(ape.socket.send).toHaveBeenCalled();
    // cleanup should have been invoked with success
    expect(cleanup).toHaveBeenCalledWith(false, { hello: 1 });
  });
});
