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
