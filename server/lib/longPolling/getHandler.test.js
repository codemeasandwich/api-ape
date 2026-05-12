/**
 * @fileoverview Tests for the SSE GET handler used by polling transport.
 *
 * Drives the handler via mocked req/res EventEmitters to exercise the
 * isActive guards in `send` and the heartbeat tick, plus the
 * `send.toString()` accessor used by the broadcast system to identify
 * the client. Cleanup paths are driven by emitting `close` on the req.
 */

const EventEmitter = require("events");
const { createGetHandler } = require("./getHandler");

function makeReqRes({ cookie } = {}) {
  const req = new EventEmitter();
  req.headers = { "user-agent": "test/1.0" };
  if (cookie) req.headers.cookie = cookie;
  req.url = "/api/ape/stream";
  req.method = "GET";

  const res = new EventEmitter();
  res.writeHead = jest.fn();
  res.write = jest.fn();
  res.setHeader = jest.fn();
  res.end = jest.fn();
  res.headersSent = false;
  return { req, res };
}

describe("longPolling/getHandler", () => {
  let originalSetInterval;

  beforeEach(() => {
    // Replace setInterval with a no-op so heartbeat doesn't actually fire
    // unless we manually trigger it.
    originalSetInterval = global.setInterval;
  });

  afterEach(() => {
    global.setInterval = originalSetInterval;
  });

  // Scenario: createGetHandler called WITHOUT options — exercises the
  // `options = {}` default-arg branch.
  test("createGetHandler accepts no options (default-arg path)", () => {
    const streamClients = new Map();
    const onConnect = jest.fn();
    const handler = createGetHandler(streamClients, onConnect);
    const { req, res } = makeReqRes();
    handler(req, res);
    expect(res.writeHead).toHaveBeenCalled();
    expect(onConnect).toHaveBeenCalled();
    req.emit("close"); // cleanup
  });

  // Scenario: client disconnects then a stray send() is called via the
  // broadcast surface. `send` must short-circuit on isActive=false and not
  // throw or write. Exercises the `if (!clientState.isActive) return` guard
  // in the inner send() at L234.
  test("send is a no-op after cleanup (isActive=false guard)", () => {
    const streamClients = new Map();
    let capturedSend;
    const onConnect = jest.fn((_unused, _req, send) => { capturedSend = send; });
    const handler = createGetHandler(streamClients, onConnect, {
      heartbeatInterval: 999999,
      recycleTimeout: 999999,
    });
    const { req, res } = makeReqRes();
    handler(req, res);
    // Trigger cleanup
    req.emit("close");
    // Reset write counter
    res.write.mockClear();
    // Now invoke send via the captured ref — should be a no-op
    capturedSend(null, "topic", { x: 1 }, null);
    expect(res.write).not.toHaveBeenCalled();
  });

  // Scenario: send.toString() returns the clientId — used by the broadcast
  // system to identify the client. Exercises the arrow function at L252.
  test("send.toString() returns the clientId", () => {
    const streamClients = new Map();
    let capturedSend;
    const onConnect = jest.fn((_unused, _req, send) => { capturedSend = send; });
    const handler = createGetHandler(streamClients, onConnect, {
      heartbeatInterval: 999999,
      recycleTimeout: 999999,
    });
    const { req, res } = makeReqRes();
    handler(req, res);
    // streamClients keys are the clientIds — first key was set when the
    // handler ran.
    const [clientId] = streamClients.keys();
    expect(typeof capturedSend.toString()).toBe("string");
    expect(capturedSend.toString()).toBe(clientId);
    req.emit("close");
  });

  // Scenario: a heartbeat tick fires AFTER cleanup completes. The
  // heartbeat callback must short-circuit on isActive=false. Driven via
  // fake timers so the tick happens deterministically after cleanup.
  test("heartbeat is a no-op after cleanup (isActive=false guard)", () => {
    jest.useFakeTimers();
    try {
      const streamClients = new Map();
      const onConnect = jest.fn();
      const handler = createGetHandler(streamClients, onConnect, {
        heartbeatInterval: 1000,
        recycleTimeout: 999999,
      });
      const { req, res } = makeReqRes();
      handler(req, res);
      // Trigger cleanup first
      req.emit("close");
      res.write.mockClear();
      // Now advance time past one heartbeat interval — tick fires but the
      // body short-circuits because clientState.isActive is false.
      jest.advanceTimersByTime(1500);
      expect(res.write).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
