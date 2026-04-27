/**
 * @fileoverview Tests for the module-level `broadcast` + `broadcastOthers`
 * exports.
 *
 * `broadcast(channel, data, excludeClientId?)` is the canonical mechanism
 * for server-side proactive push to all connected clients (no subscription
 * required). These tests pin the contract so:
 *   1. Every connected client receives the frame.
 *   2. The optional `excludeClientId` is honored — that client does NOT
 *      receive the frame.
 *   3. Per-client send failures are swallowed (best-effort fan-out) so
 *      one slow / dead WebSocket doesn't block delivery to the rest.
 *   4. `broadcastOthers` is a clarity-named wrapper that requires the
 *      excluded id and delegates to `broadcast`.
 */

const {
  _clients,
  addClient,
} = require("./clients");
const { broadcast, broadcastOthers } = require("./index");

/**
 * Build a fake clientInfo with a recording `send`. The `send` function in
 * `createClientWrapper` calls `clientInfo.send(false, type, data, false)`,
 * so the recording shape mirrors that signature exactly.
 */
function fakeClient(id, opts = {}) {
  const sent = [];
  const sendFn = opts.throwOnSend
    ? () => { throw new Error(`mock send failure for ${id}`); }
    : (a, type, data) => { sent.push({ type, data }); };
  addClient({ clientId: id, send: sendFn });
  return { id, sent };
}

describe("broadcast (module-level export)", () => {
  beforeEach(() => {
    _clients.clear();
  });

  describe("delivery — all clients receive", () => {
    test("every connected client receives the frame", () => {
      const a = fakeClient("client-a");
      const b = fakeClient("client-b");
      const c = fakeClient("client-c");

      broadcast("/notification", { msg: "hello" });

      expect(a.sent).toEqual([{ type: "/notification", data: { msg: "hello" } }]);
      expect(b.sent).toEqual([{ type: "/notification", data: { msg: "hello" } }]);
      expect(c.sent).toEqual([{ type: "/notification", data: { msg: "hello" } }]);
    });

    test("zero-clients case is a silent no-op", () => {
      expect(() => broadcast("/notification", { msg: "hello" })).not.toThrow();
    });

    test("data payload is forwarded as-is (objects, strings, numbers, null)", () => {
      const a = fakeClient("client-a");
      broadcast("/t", { nested: { foo: "bar" }, n: 42 });
      broadcast("/t", "string-payload");
      broadcast("/t", 123);
      broadcast("/t", null);
      expect(a.sent).toEqual([
        { type: "/t", data: { nested: { foo: "bar" }, n: 42 } },
        { type: "/t", data: "string-payload" },
        { type: "/t", data: 123 },
        { type: "/t", data: null },
      ]);
    });
  });

  describe("excludeClientId", () => {
    test("skips the excluded client", () => {
      const a = fakeClient("client-a");
      const b = fakeClient("client-b");
      const c = fakeClient("client-c");

      broadcast("/notification", { msg: "hello" }, "client-b");

      expect(a.sent.length).toBe(1);
      expect(b.sent.length).toBe(0);
      expect(c.sent.length).toBe(1);
    });

    test("unknown excludeClientId is harmless (everyone receives)", () => {
      const a = fakeClient("client-a");
      const b = fakeClient("client-b");

      broadcast("/notification", { msg: "hello" }, "no-such-client");

      expect(a.sent.length).toBe(1);
      expect(b.sent.length).toBe(1);
    });

    test("undefined excludeClientId behaves like no exclusion", () => {
      const a = fakeClient("client-a");
      const b = fakeClient("client-b");

      broadcast("/notification", { msg: "hello" }, undefined);

      expect(a.sent.length).toBe(1);
      expect(b.sent.length).toBe(1);
    });
  });

  describe("resilience — per-client send failures are swallowed", () => {
    test("one failing send does not block delivery to others", () => {
      const a = fakeClient("client-a");
      const b = fakeClient("client-b", { throwOnSend: true });
      const c = fakeClient("client-c");

      // Should NOT throw, even though client-b's send throws
      expect(() => broadcast("/notification", { msg: "hello" })).not.toThrow();

      // a + c received; b's failure was swallowed
      expect(a.sent.length).toBe(1);
      expect(b.sent.length).toBe(0);
      expect(c.sent.length).toBe(1);
    });

    test("all clients failing is still a silent no-op", () => {
      fakeClient("client-a", { throwOnSend: true });
      fakeClient("client-b", { throwOnSend: true });

      expect(() => broadcast("/notification", { msg: "hello" })).not.toThrow();
    });
  });
});

describe("broadcastOthers (module-level export)", () => {
  beforeEach(() => {
    _clients.clear();
  });

  test("delegates to broadcast with excludeClientId", () => {
    const a = fakeClient("client-a");
    const b = fakeClient("client-b");
    const c = fakeClient("client-c");

    broadcastOthers("/typing", { userId: "u-42" }, "client-b");

    expect(a.sent.length).toBe(1);
    expect(b.sent.length).toBe(0);
    expect(c.sent.length).toBe(1);
  });

  test("forwards the same channel + data shape as broadcast", () => {
    const a = fakeClient("client-a");
    fakeClient("client-b");

    broadcastOthers("/chat/room1", { text: "Hi" }, "client-b");

    expect(a.sent).toEqual([{ type: "/chat/room1", data: { text: "Hi" } }]);
  });
});
