/**
 * @fileoverview Tests for Client Tracking
 *
 * Tests the client management with auth state tracking.
 */

const {
  clients,
  _clients,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
} = require("./clients");

describe("Client Tracking", () => {
  beforeEach(() => {
    _clients.clear();
  });

  describe("addClient", () => {
    test("adds client to internal map", () => {
      addClient({ clientId: "test-1" });

      expect(_clients.has("test-1")).toBe(true);
    });

    test("calls onAdd callback", () => {
      const onAdd = jest.fn();
      addClient({ clientId: "test-2" }, onAdd);

      expect(onAdd).toHaveBeenCalledWith("test-2");
    });
  });

  describe("removeClient", () => {
    test("removes client by ID string", () => {
      addClient({ clientId: "test-3" });
      removeClient("test-3");

      expect(_clients.has("test-3")).toBe(false);
    });

    test("removes client by info object", () => {
      addClient({ clientId: "test-4" });
      removeClient({ clientId: "test-4" });

      expect(_clients.has("test-4")).toBe(false);
    });

    test("calls onRemove callback", () => {
      const onRemove = jest.fn();
      addClient({ clientId: "test-5" });
      removeClient("test-5", onRemove);

      expect(onRemove).toHaveBeenCalledWith("test-5");
    });

    test("handles removal of non-existent client", () => {
      expect(() => removeClient("nonexistent")).not.toThrow();
    });
  });

  describe("updateClientEmbed", () => {
    test("updates embed values", () => {
      addClient({ clientId: "test-6" });
      updateClientEmbed("test-6", { custom: "value" });

      expect(_clients.get("test-6").embed).toEqual({ custom: "value" });
    });

    test("handles non-existent client", () => {
      expect(() => updateClientEmbed("nonexistent", {})).not.toThrow();
    });
  });

  describe("updateClientSend", () => {
    test("updates send function", () => {
      const mockSend = jest.fn();
      addClient({ clientId: "test-7" });
      updateClientSend("test-7", mockSend);

      // Access internal _raw to verify
      const wrapper = _clients.get("test-7");
      expect(wrapper._raw.send).toBe(mockSend);
    });

    test("handles non-existent client", () => {
      expect(() => updateClientSend("nonexistent", jest.fn())).not.toThrow();
    });
  });

  describe("updateClientAuth", () => {
    test("updates socketAuth reference", () => {
      const mockSocketAuth = { getState: jest.fn() };
      addClient({ clientId: "test-8" });
      updateClientAuth("test-8", mockSocketAuth);

      const wrapper = _clients.get("test-8");
      expect(wrapper._raw.socketAuth).toBe(mockSocketAuth);
    });

    test("handles non-existent client", () => {
      expect(() => updateClientAuth("nonexistent", {})).not.toThrow();
    });
  });

  describe("ClientWrapper getters", () => {
    test("clientId returns correct value", () => {
      addClient({ clientId: "getter-test" });
      expect(_clients.get("getter-test").clientId).toBe("getter-test");
    });

    test("sessionId returns null when not set", () => {
      addClient({ clientId: "session-test" });
      expect(_clients.get("session-test").sessionId).toBeNull();
    });

    test("sessionId returns value when set", () => {
      addClient({ clientId: "session-test-2", sessionId: "sess-123" });
      expect(_clients.get("session-test-2").sessionId).toBe("sess-123");
    });

    test("embed returns empty object when not set", () => {
      addClient({ clientId: "embed-test" });
      expect(_clients.get("embed-test").embed).toEqual({});
    });

    test("agent returns empty object when not set", () => {
      addClient({ clientId: "agent-test" });
      expect(_clients.get("agent-test").agent).toEqual({});
    });

    test("agent returns value when set", () => {
      addClient({ clientId: "agent-test-2", agent: { browser: "Chrome" } });
      expect(_clients.get("agent-test-2").agent).toEqual({ browser: "Chrome" });
    });
  });

  describe("ClientWrapper auth getters", () => {
    test("authState returns null when socketAuth not set", () => {
      addClient({ clientId: "auth-test-1" });
      expect(_clients.get("auth-test-1").authState).toBeNull();
    });

    test("authState returns state from socketAuth", () => {
      const mockState = { state: "AUTHENTICATED", tier: 1 };
      const mockSocketAuth = { getState: jest.fn().mockReturnValue(mockState) };
      addClient({ clientId: "auth-test-2", socketAuth: mockSocketAuth });

      expect(_clients.get("auth-test-2").authState).toEqual(mockState);
      expect(mockSocketAuth.getState).toHaveBeenCalled();
    });

    test("isAuthenticated returns false when socketAuth not set", () => {
      addClient({ clientId: "auth-test-3" });
      expect(_clients.get("auth-test-3").isAuthenticated).toBe(false);
    });

    test("isAuthenticated returns value from socketAuth", () => {
      const mockSocketAuth = { isAuthenticated: jest.fn().mockReturnValue(true) };
      addClient({ clientId: "auth-test-4", socketAuth: mockSocketAuth });

      expect(_clients.get("auth-test-4").isAuthenticated).toBe(true);
      expect(mockSocketAuth.isAuthenticated).toHaveBeenCalled();
    });

    test("authTier returns 0 when socketAuth not set", () => {
      addClient({ clientId: "auth-test-5" });
      expect(_clients.get("auth-test-5").authTier).toBe(0);
    });

    test("authTier returns tier from socketAuth", () => {
      const mockSocketAuth = { getTier: jest.fn().mockReturnValue(2) };
      addClient({ clientId: "auth-test-6", socketAuth: mockSocketAuth });

      expect(_clients.get("auth-test-6").authTier).toBe(2);
      expect(mockSocketAuth.getTier).toHaveBeenCalled();
    });
  });

  describe("clients proxy", () => {
    test("allows get operation", () => {
      addClient({ clientId: "proxy-test" });
      expect(clients.get("proxy-test")).toBeDefined();
    });

    test("allows size property", () => {
      addClient({ clientId: "proxy-size" });
      expect(clients.size).toBe(1);
    });

    test("allows has operation", () => {
      addClient({ clientId: "proxy-has" });
      expect(clients.has("proxy-has")).toBe(true);
    });

    test("blocks set operation", () => {
      expect(() => clients.set("blocked", {})).toThrow(
        "ape.clients.set() is not allowed"
      );
    });

    test("blocks delete operation", () => {
      expect(() => clients.delete("blocked")).toThrow(
        "ape.clients.delete() is not allowed"
      );
    });

    test("blocks clear operation", () => {
      expect(() => clients.clear()).toThrow(
        "ape.clients.clear() is not allowed"
      );
    });

    test("allows forEach iteration", () => {
      addClient({ clientId: "iter-1" });
      addClient({ clientId: "iter-2" });

      const ids = [];
      clients.forEach((wrapper) => {
        ids.push(wrapper.clientId);
      });

      expect(ids).toEqual(expect.arrayContaining(["iter-1", "iter-2"]));
    });

    test("returns non-function intrinsic properties without binding (Symbol.toStringTag)", () => {
      // The proxy's get-trap takes a `typeof value === "function" ? bind : value`
      // branch. Map's well-known Symbol.toStringTag is the string "Map", which
      // hits the non-function branch — proving the path is exercised and
      // returns the raw value without wrapping.
      expect(clients[Symbol.toStringTag]).toBe("Map");
    });
  });

  describe("ClientWrapper send", () => {
    test("send calls underlying send function", () => {
      const mockSend = jest.fn();
      addClient({ clientId: "send-test", send: mockSend });

      _clients.get("send-test").send("type", { data: "test" });

      expect(mockSend).toHaveBeenCalledWith(false, "type", { data: "test" }, false);
    });

    test("send handles missing send function gracefully", () => {
      addClient({ clientId: "send-test-2" });

      expect(() =>
        _clients.get("send-test-2").send("type", { data: "test" })
      ).not.toThrow();
    });
  });
});
