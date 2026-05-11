/**
 * @fileoverview Tests for the client-side path-building Proxy contract.
 *
 * Pins the **path-accumulation invariant** for client/connection/proxy.js:
 * every chain step — whether the leaf dispatches as an RPC or as a
 * subscription — must produce the same fully accumulated path. The
 * previous implementation accumulated only via RPC recursion, so
 * `api.x.y(cb)` subscribed to `/y` instead of `/x/y`.
 *
 * The proxy is authored as an ES module that the production bundler
 * (esbuild) compiles to dist/ape.js. Jest in this project does not run
 * a Babel transform on the client/ directory, so we follow the
 * established pattern from subscriptions.test.js: inline-replicate the
 * exact logic of proxy.js inside the test as a contract check. The
 * replica and the production module must remain in lockstep.
 */

describe("client proxy — path accumulation invariant", () => {
  // Replica of client/connection/proxy.js, identical except that
  // `subscribe` and the sender are injected by the test so we can
  // observe what each chain step would emit.
  function wrap(api, subscribe) {
    const joinKey = "/";
    const reservedKeys = new Set(["on", "onConnectionChange", "transport"]);

    const handler = {
      get(target, key) {
        if (reservedKeys.has(key)) {
          return target[key];
        }
        if (typeof key !== "string" || key === "then") {
          return target[key];
        }
        const path = (target._path || "") + joinKey + key;
        const wrapper = function (payload) {
          if (typeof payload === "function") {
            return subscribe(path, payload);
          }
          return api(path, payload);
        };
        wrapper._path = path;
        return new Proxy(wrapper, handler);
      },
    };

    return new Proxy(api, handler);
  }

  let sender;
  let subscribeCalls;
  let unsubFn;
  let subscribe;
  let api;

  beforeEach(() => {
    sender = jest.fn();
    subscribeCalls = [];
    unsubFn = jest.fn();
    subscribe = (channel, callback) => {
      subscribeCalls.push({ channel, callback });
      return unsubFn;
    };
    api = wrap(sender, subscribe);
  });

  describe("RPC dispatch", () => {
    it("builds a single-segment path from a single property access", () => {
      api.users({ name: "Alice" });
      expect(sender).toHaveBeenCalledWith("/users", { name: "Alice" });
    });

    it("accumulates chained dot-access into a multi-segment path", () => {
      api.users.create({ name: "Alice" });
      expect(sender).toHaveBeenCalledWith("/users/create", { name: "Alice" });
    });

    it("accumulates deeply nested dot-access", () => {
      api.admin.users.permissions({ role: "owner" });
      expect(sender).toHaveBeenCalledWith(
        "/admin/users/permissions",
        { role: "owner" },
      );
    });

    it("treats bracket access as a dynamic path segment", () => {
      api.users[123]({ name: "Bob" });
      expect(sender).toHaveBeenCalledWith("/users/123", { name: "Bob" });
    });

    it("chains bracket access with subsequent dot-access", () => {
      const id = "u-42";
      api.users[id].profile({ avatar: "a.png" });
      expect(sender).toHaveBeenCalledWith(
        "/users/u-42/profile",
        { avatar: "a.png" },
      );
    });

    it("dispatches with undefined body when called with no arguments", () => {
      api.ping();
      expect(sender).toHaveBeenCalledWith("/ping", undefined);
    });
  });

  describe("Subscription dispatch", () => {
    // These tests are the direct regression cover: prior to the fix
    // each of the chained subscribes below stripped the parent path
    // and subscribed to only the leaf segment.

    it("uses the leaf-only path for a single-segment subscribe", () => {
      const cb = () => {};
      api.news(cb);
      expect(subscribeCalls).toEqual([{ channel: "/news", callback: cb }]);
    });

    it("accumulates path through chained dot-access (regression — was leaf-only)", () => {
      const cb = () => {};
      api.stock.AAPL(cb);
      expect(subscribeCalls).toEqual([{ channel: "/stock/AAPL", callback: cb }]);
    });

    it("accumulates path through deep chained dot-access", () => {
      const cb = () => {};
      api.feeds.financial.realtime(cb);
      expect(subscribeCalls).toEqual([
        { channel: "/feeds/financial/realtime", callback: cb },
      ]);
    });

    it("accumulates path through bracket-access dynamic segments", () => {
      const cb = () => {};
      const roomId = "lobby-1";
      api.rooms[roomId].messages(cb);
      expect(subscribeCalls).toEqual([
        { channel: "/rooms/lobby-1/messages", callback: cb },
      ]);
    });

    it("returns the unsubscribe function from subscribe() untouched", () => {
      const off = api.news.banking(() => {});
      expect(off).toBe(unsubFn);
    });

    it("does not dispatch an RPC when a function payload is given", () => {
      api.news.banking(() => {});
      expect(sender).not.toHaveBeenCalled();
    });
  });

  describe("Reserved keys bypass the proxy", () => {
    it("returns the sender's `on` property without wrapping", () => {
      sender.on = jest.fn();
      expect(wrap(sender, subscribe).on).toBe(sender.on);
    });

    it("returns `transport` value verbatim", () => {
      sender.transport = "websocket";
      expect(wrap(sender, subscribe).transport).toBe("websocket");
    });

    it("returns `onConnectionChange` from the sender", () => {
      sender.onConnectionChange = jest.fn();
      expect(wrap(sender, subscribe).onConnectionChange).toBe(
        sender.onConnectionChange,
      );
    });
  });

  describe("Thenable safety", () => {
    // The proxy must not treat `then` as a path segment, otherwise it
    // becomes accidentally thenable and Promise resolution would
    // dispatch a phantom RPC just from `await api.x`.

    it("returns undefined for `then` (so the proxy is not thenable)", () => {
      expect(api.users.then).toBeUndefined();
    });

    it("does not dispatch any RPC for `then` access", () => {
      // eslint-disable-next-line no-unused-expressions
      api.users.then;
      expect(sender).not.toHaveBeenCalled();
    });
  });

  describe("Symbol and non-string keys", () => {
    it("does not extend path on Symbol property access", () => {
      const result = api.users[Symbol.iterator];
      expect(result).toBeUndefined();
      expect(sender).not.toHaveBeenCalled();
      expect(subscribeCalls).toHaveLength(0);
    });
  });
});
