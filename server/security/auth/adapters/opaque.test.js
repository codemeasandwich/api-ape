/**
 * @fileoverview Tests for OPAQUE Authentication Adapter
 */

const {
  createOpaqueAdapter,
  OpaqueMessageType,
  OpaqueError,
} = require("./opaque");

describe("OPAQUE Adapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = createOpaqueAdapter();
    // Clear the default user store between tests
    adapter._defaultUserStore.clear();
  });

  describe("Registration Flow", () => {
    test("handleRegStart rejects invalid username", async () => {
      await expect(
        adapter.handleRegStart({
          clientId: "test-client",
          user: null,
          clientNonce: "nonce",
          regRequest: "req",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_MESSAGE });
    });

    test("handleRegStart rejects non-string username", async () => {
      await expect(
        adapter.handleRegStart({
          clientId: "test-client",
          user: 123,
          clientNonce: "nonce",
          regRequest: "req",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_MESSAGE });
    });

    test("handleRegFinish rejects when no pending registration", async () => {
      await expect(
        adapter.handleRegFinish({
          clientId: "test-client",
          user: "noregistration",
          clientNonce: "nonce",
          regRecord: "record",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_STATE });
    });

    test("handleRegStart returns registration response", async () => {
      const result = await adapter.handleRegStart({
        clientId: "test-client",
        user: "alice",
        clientNonce: "client-nonce-123",
        regRequest: "base64-reg-request",
      });

      expect(result.type).toBe(OpaqueMessageType.REG_RESPONSE);
      expect(result.serverNonce).toBeDefined();
      expect(result.ts).toBeDefined();
    });

    test("handleRegStart rejects existing user", async () => {
      // First registration
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "alice",
        clientNonce: "nonce1",
        regRequest: "req1",
      });

      await adapter.handleRegFinish({
        clientId: "test-client",
        user: "alice",
        clientNonce: "nonce1",
        regRecord: "base64-record",
      });

      // Try to register again
      await expect(
        adapter.handleRegStart({
          clientId: "test-client",
          user: "alice",
          clientNonce: "nonce2",
          regRequest: "req2",
        })
      ).rejects.toMatchObject({ code: OpaqueError.USER_EXISTS });
    });

    test("handleRegFinish completes registration", async () => {
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "bob",
        clientNonce: "nonce-123",
        regRequest: "req",
      });

      const result = await adapter.handleRegFinish({
        clientId: "test-client",
        user: "bob",
        clientNonce: "nonce-123",
        regRecord: "base64-record",
      });

      expect(result.type).toBe(OpaqueMessageType.REG_OK);
      expect(result.msg).toBe("registered");
    });

    test("handleRegFinish rejects mismatched nonce", async () => {
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "charlie",
        clientNonce: "correct-nonce",
        regRequest: "req",
      });

      await expect(
        adapter.handleRegFinish({
          clientId: "test-client",
          user: "charlie",
          clientNonce: "wrong-nonce",
          regRecord: "record",
        })
      ).rejects.toMatchObject({ code: OpaqueError.NONCE_MISMATCH });
    });
  });

  describe("Authentication Flow", () => {
    beforeEach(async () => {
      // Register a user first
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "testuser",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await adapter.handleRegFinish({
        clientId: "test-client",
        user: "testuser",
        clientNonce: "reg-nonce",
        regRecord: "base64-record",
      });
    });

    test("handleAuthStart returns challenge", async () => {
      const result = await adapter.handleAuthStart({
        clientId: "auth-client",
        user: "testuser",
        clientNonce: "auth-nonce",
      });

      expect(result.type).toBe(OpaqueMessageType.AUTH_1);
      expect(result.serverNonce).toBeDefined();
      expect(result.envelope).toBe("base64-record");
    });

    test("handleAuthStart rejects unknown user", async () => {
      await expect(
        adapter.handleAuthStart({
          clientId: "auth-client",
          user: "unknown",
          clientNonce: "nonce",
        })
      ).rejects.toMatchObject({ code: OpaqueError.USER_NOT_FOUND });
    });

    test("handleAuthStart rejects invalid username", async () => {
      await expect(
        adapter.handleAuthStart({
          clientId: "auth-client",
          user: null,
          clientNonce: "nonce",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_MESSAGE });
    });

    test("handleAuthFinish rejects mismatched nonce", async () => {
      await adapter.handleAuthStart({
        clientId: "auth-client",
        user: "testuser",
        clientNonce: "correct-nonce",
      });

      await expect(
        adapter.handleAuthFinish({
          clientId: "auth-client",
          user: "testuser",
          clientNonce: "wrong-nonce",
          clientAuth: "proof",
        })
      ).rejects.toMatchObject({ code: OpaqueError.NONCE_MISMATCH });
    });

    test("handleAuthFinish returns success (mock mode)", async () => {
      await adapter.handleAuthStart({
        clientId: "auth-client",
        user: "testuser",
        clientNonce: "auth-nonce",
      });

      const result = await adapter.handleAuthFinish({
        clientId: "auth-client",
        user: "testuser",
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      expect(result.type).toBe(OpaqueMessageType.AUTH_OK);
      expect(result.assignedPrincipal.userId).toBe("testuser");
      expect(result.tier).toBe(1);
    });

    test("handleAuthFinish rejects without auth start", async () => {
      await expect(
        adapter.handleAuthFinish({
          clientId: "new-client",
          user: "testuser",
          clientNonce: "nonce",
          clientAuth: "proof",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_STATE });
    });
  });

  describe("Canonical Binding", () => {
    test("creates correct binding string", () => {
      const binding = adapter.createCanonicalBinding({
        clientId: "client-123",
        clientNonce: "cn",
        serverNonce: "sn",
        user: "alice",
        ts: 1234567890,
      });

      expect(binding).toBe("client-123|cn|sn|alice|1234567890");
    });
  });

  describe("Session Expiry", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("handleRegFinish rejects expired session via timeout cleanup", async () => {
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "expire-user",
        clientNonce: "nonce",
        regRequest: "req",
      });

      // The session cleanup timeout runs after nonceExpiry + 1000ms
      // nonceExpiry default is 5 minutes = 300000ms
      // So advancing past that triggers the cleanup, resulting in INVALID_STATE
      jest.advanceTimersByTime(5 * 60 * 1000 + 1001);

      await expect(
        adapter.handleRegFinish({
          clientId: "test-client",
          user: "expire-user",
          clientNonce: "nonce",
          regRecord: "record",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_STATE });
    });

    test("handleAuthFinish rejects expired session via timeout cleanup", async () => {
      // Setup user first with real timers
      jest.useRealTimers();
      await adapter.handleRegStart({
        clientId: "test-client",
        user: "auth-expire-user",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await adapter.handleRegFinish({
        clientId: "test-client",
        user: "auth-expire-user",
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      jest.useFakeTimers();

      await adapter.handleAuthStart({
        clientId: "auth-client",
        user: "auth-expire-user",
        clientNonce: "auth-nonce",
      });

      // The session cleanup timeout runs after nonceExpiry + 1000ms
      jest.advanceTimersByTime(5 * 60 * 1000 + 1001);

      await expect(
        adapter.handleAuthFinish({
          clientId: "auth-client",
          user: "auth-expire-user",
          clientNonce: "auth-nonce",
          clientAuth: "proof",
        })
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_STATE });
    });
  });

  describe("Cleanup", () => {
    test("cleanupClient removes pending sessions", async () => {
      await adapter.handleRegStart({
        clientId: "cleanup-client",
        user: "cleanup-user",
        clientNonce: "nonce",
        regRequest: "req",
      });

      expect(adapter._pendingSessions.size).toBe(1);

      adapter.cleanupClient("cleanup-client");

      expect(adapter._pendingSessions.size).toBe(0);
    });
  });

  describe("hasOpaqueLib", () => {
    test("returns false when no lib configured", () => {
      expect(adapter.hasOpaqueLib()).toBe(false);
    });

    test("returns true when lib is provided", () => {
      const adapterWithLib = createOpaqueAdapter({
        opaqueLib: { serverRegistrationStart: () => {} },
      });
      expect(adapterWithLib.hasOpaqueLib()).toBe(true);
    });
  });
});
