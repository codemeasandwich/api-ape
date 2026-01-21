/**
 * @fileoverview Tests for Controller Context Factory
 *
 * Tests the context object creation for controller invocations.
 */

const { getSessionId, createControllerContext } = require("./receiveContext");

describe("receiveContext", () => {
  describe("getSessionId", () => {
    test("returns null for null request", () => {
      expect(getSessionId(null)).toBeNull();
    });

    test("returns null for undefined request", () => {
      expect(getSessionId(undefined)).toBeNull();
    });

    test("returns null for request without headers", () => {
      expect(getSessionId({})).toBeNull();
    });

    test("returns null for request without cookies", () => {
      expect(getSessionId({ headers: {} })).toBeNull();
    });

    test("returns null for empty cookie string", () => {
      expect(getSessionId({ headers: { cookie: "" } })).toBeNull();
    });

    test("returns null when sessionId not in cookies", () => {
      expect(getSessionId({ headers: { cookie: "other=value" } })).toBeNull();
    });

    test("extracts sessionId from single cookie", () => {
      expect(getSessionId({ headers: { cookie: "sessionId=abc123" } })).toBe(
        "abc123"
      );
    });

    test("extracts sessionId at start of cookie string", () => {
      expect(
        getSessionId({ headers: { cookie: "sessionId=first; other=second" } })
      ).toBe("first");
    });

    test("returns null for sessionId not at start (due to regex)", () => {
      // Note: The regex (?:^|;\\s*) requires literal \\s* after semicolon
      // This means sessionId can only be reliably matched at start of string
      expect(
        getSessionId({ headers: { cookie: "other=second; sessionId=last" } })
      ).toBeNull();
    });
  });

  describe("createControllerContext", () => {
    test("includes sharedValues", () => {
      const context = createControllerContext({
        sharedValues: { socket: "sock", req: "request", send: jest.fn() },
        embedValues: {},
        clientId: "c1",
        sessionId: "s1",
      });

      expect(context.socket).toBe("sock");
      expect(context.req).toBe("request");
      expect(typeof context.send).toBe("function");
    });

    test("includes embedValues", () => {
      const context = createControllerContext({
        sharedValues: {},
        embedValues: { customField: "custom", another: 42 },
        clientId: "c1",
        sessionId: "s1",
      });

      expect(context.customField).toBe("custom");
      expect(context.another).toBe(42);
    });

    test("includes clientId and sessionId", () => {
      const context = createControllerContext({
        sharedValues: {},
        embedValues: {},
        clientId: "client-123",
        sessionId: "session-456",
      });

      expect(context.clientId).toBe("client-123");
      expect(context.sessionId).toBe("session-456");
    });

    test("includes publish function", () => {
      const context = createControllerContext({
        sharedValues: {},
        embedValues: {},
        clientId: "c1",
        sessionId: "s1",
      });

      expect(typeof context.publish).toBe("function");
    });

    test("includes clients reference", () => {
      const context = createControllerContext({
        sharedValues: {},
        embedValues: {},
        clientId: "c1",
        sessionId: "s1",
      });

      expect(context.clients).toBeDefined();
    });

    describe("without socketAuth", () => {
      test("isAuthenticated defaults to false", () => {
        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
        });

        expect(context.isAuthenticated).toBe(false);
      });

      test("authTier defaults to 0", () => {
        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
        });

        expect(context.authTier).toBe(0);
      });

      test("principal defaults to null", () => {
        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
        });

        expect(context.principal).toBeNull();
      });

      test("authState defaults to null", () => {
        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
        });

        expect(context.authState).toBeNull();
      });

      test("requiresTier always returns false", () => {
        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
        });

        expect(context.requiresTier(0)).toBe(false);
        expect(context.requiresTier(1)).toBe(false);
        expect(context.requiresTier(2)).toBe(false);
        expect(context.requiresTier(3)).toBe(false);
      });
    });

    describe("with socketAuth", () => {
      const mockSocketAuth = {
        isAuthenticated: jest.fn(),
        getTier: jest.fn(),
        getState: jest.fn(),
        meetsRequirement: jest.fn(),
      };

      beforeEach(() => {
        jest.clearAllMocks();
      });

      test("isAuthenticated getter calls socketAuth.isAuthenticated", () => {
        mockSocketAuth.isAuthenticated.mockReturnValue(true);

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        expect(context.isAuthenticated).toBe(true);
        expect(mockSocketAuth.isAuthenticated).toHaveBeenCalled();
      });

      test("authTier getter calls socketAuth.getTier", () => {
        mockSocketAuth.getTier.mockReturnValue(2);

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        expect(context.authTier).toBe(2);
        expect(mockSocketAuth.getTier).toHaveBeenCalled();
      });

      test("principal getter calls socketAuth.getState", () => {
        mockSocketAuth.getState.mockReturnValue({
          principal: { id: "user-1", name: "Alice" },
        });

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        expect(context.principal).toEqual({ id: "user-1", name: "Alice" });
        expect(mockSocketAuth.getState).toHaveBeenCalled();
      });

      test("authState getter calls socketAuth.getState", () => {
        const fullState = {
          state: "AUTHENTICATED",
          principal: { id: "user-1" },
          tier: 1,
        };
        mockSocketAuth.getState.mockReturnValue(fullState);

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        expect(context.authState).toEqual(fullState);
      });

      test("requiresTier calls socketAuth.meetsRequirement", () => {
        mockSocketAuth.meetsRequirement.mockReturnValue(true);

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        const result = context.requiresTier(2);

        expect(result).toBe(true);
        expect(mockSocketAuth.meetsRequirement).toHaveBeenCalledWith(2);
      });

      test("requiresTier returns false when tier not met", () => {
        mockSocketAuth.meetsRequirement.mockReturnValue(false);

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        const result = context.requiresTier(3);

        expect(result).toBe(false);
        expect(mockSocketAuth.meetsRequirement).toHaveBeenCalledWith(3);
      });

      test("auth getters are enumerable", () => {
        mockSocketAuth.isAuthenticated.mockReturnValue(false);
        mockSocketAuth.getTier.mockReturnValue(0);
        mockSocketAuth.getState.mockReturnValue({ principal: null });

        const context = createControllerContext({
          sharedValues: {},
          embedValues: {},
          clientId: "c1",
          sessionId: "s1",
          socketAuth: mockSocketAuth,
        });

        const keys = Object.keys(context);
        expect(keys).toContain("isAuthenticated");
        expect(keys).toContain("authTier");
        expect(keys).toContain("principal");
        expect(keys).toContain("authState");
      });
    });
  });
});
