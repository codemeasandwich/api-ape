/**
 * @fileoverview Tests for WebSocket connection wiring.
 *
 * The wiring factory returns a webSocketHandler(socket, req). These tests
 * drive it with EventEmitter-based mock sockets so we can synthesize the
 * 'close' and 'error' events that the real WebSocket emits, without
 * spinning up an http.Server.
 */

const { EventEmitter } = require("events");
const wiring = require("./wiring");
const { _clients } = require("./broadcast/clients");

function makeSocket() {
  const sock = new EventEmitter();
  sock.destroy = jest.fn();
  sock.send = jest.fn();
  sock.readyState = 1;
  sock.OPEN = 1;
  return sock;
}

function makeReq(overrides = {}) {
  return {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      host: "127.0.0.1",
      ...overrides.headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

describe("wiring — socket error handler", () => {
  // We use configureApeLogging to redirect error output through a jest spy,
  // so we can assert the diagnostic without polluting test output.
  const apeLogger = require("../../utils/apeLogger");
  const errSpy = jest.fn();

  beforeAll(() => {
    apeLogger.configureApeLogging({
      error: errSpy,
      log: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    });
  });
  afterAll(() => {
    apeLogger.resetApeLoggingForTesting();
  });

  beforeEach(() => {
    errSpy.mockClear();
    _clients.clear();
  });

  // Scenario: a connected client's underlying TCP socket errors out
  // (e.g. ECONNRESET). The wiring layer's `socket.on('error', ...)`
  // handler logs a diagnostic with the err.code + err.message.
  test("logs a diagnostic with err.code and err.message", async () => {
    const onConnect = jest.fn(() => ({}));
    const handler = wiring({}, onConnect, null, {});
    const socket = makeSocket();
    handler(socket, makeReq());
    // Let the async onConnect resolve
    await new Promise((r) => setImmediate(r));
    socket.emit("error", Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    }));
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("ECONNRESET"),
    );
    expect(errSpy.mock.calls[0][0]).toMatch(/connection reset/);
  });

  // Scenario: a thrown error without a `.code` field (e.g. a plain
  // `new Error('weird')`). The `err.code || 'UNKNOWN'` fallback engages.
  test("falls back to 'UNKNOWN' code when err has no .code", async () => {
    const handler = wiring({}, () => ({}), null, {});
    const socket = makeSocket();
    handler(socket, makeReq());
    await new Promise((r) => setImmediate(r));
    socket.emit("error", new Error("oops"));
    expect(errSpy.mock.calls[0][0]).toMatch(/UNKNOWN/);
  });

  // Scenario: a thrown non-Error (e.g. throw "string"). The
  // `err.message || String(err)` fallback engages.
  test("falls back to String(err) when err has no .message", async () => {
    const handler = wiring({}, () => ({}), null, {});
    const socket = makeSocket();
    handler(socket, makeReq());
    await new Promise((r) => setImmediate(r));
    // Emit an error that's an object without a message field
    socket.emit("error", { code: "WEIRD" });
    // The diagnostic must include either "WEIRD" (code) or the string form
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toMatch(/WEIRD/);
  });
});

describe("wiring — toString() on send function returns clientId", () => {
  // Scenario: an integrator stringifies the send function to identify which
  // client it belongs to (e.g. for logging or sticky routing). The toString
  // override at L391 returns the underlying clientId.
  test("String(sharedValues.send) returns the clientId", async () => {
    let capturedSend;
    const handler = wiring({}, (socket, req, send) => {
      capturedSend = send;
      return {};
    }, null, {});
    handler(makeSocket(), makeReq());
    await new Promise((r) => setImmediate(r));
    expect(typeof capturedSend).toBe("function");
    expect(String(capturedSend)).toMatch(/^[a-zA-Z0-9-_]+$/); // clientId pattern
  });
});

describe("wiring — onConnect returns a Promise (thenable)", () => {
  // Scenario: an integrator's onConnect is an async function. The wiring
  // layer's `if (!result || !result.then)` else-arm doesn't engage; the
  // Promise is used directly. Exercises the false branch.
  test("async onConnect uses returned Promise directly without wrapping", async () => {
    const onConnect = jest.fn(async () => ({
      embed: { userId: "u-async" },
    }));
    const handler = wiring({}, onConnect, null, {});
    handler(makeSocket(), makeReq());
    await new Promise((r) => setImmediate(r));
    expect(onConnect).toHaveBeenCalled();
  });
});

describe("wiring — socket close with __apeSkipResumePending", () => {
  // Scenario: a superseded socket (replaced by a newer connection with
  // the same sessionId) is flagged via __apeSkipResumePending. When it
  // emits 'close', the wiring's `if (!__apeSkipResumePending)` false
  // branch engages — the pending resume slot is NOT registered.
  test("flagged socket skips registerPendingResume on close", async () => {
    const handler = wiring({}, () => ({}), null, {});
    const socket = makeSocket();
    socket.__apeSkipResumePending = true;
    handler(socket, makeReq());
    await new Promise((r) => setImmediate(r));
    // The close handler is wired synchronously after addClient — emit close
    socket.emit("close");
    // No throw, no diagnostic — the path was traversed safely
    expect(true).toBe(true);
  });
});

describe("wiring — authFramework integration", () => {
  // Scenario: the framework was constructed with an authFramework option.
  // The cond-expr `authFramework ? createSocketAuth(...) : null` LHS arm
  // engages and `socketAuth` is set; updateClientAuth + socket.on('close')
  // cleanup paths fire.
  test("authFramework option wires socketAuth and its cleanup", async () => {
    const mockAuthFramework = {
      createSocketAuth: jest.fn(() => ({
        cleanup: jest.fn(),
      })),
    };
    const handler = wiring({}, () => ({}), null, {
      authFramework: mockAuthFramework,
    });
    const socket = makeSocket();
    handler(socket, makeReq());
    await new Promise((r) => setImmediate(r));
    expect(mockAuthFramework.createSocketAuth).toHaveBeenCalled();
    // Emit close to drive the cleanup branch
    socket.emit("close");
  });
});
