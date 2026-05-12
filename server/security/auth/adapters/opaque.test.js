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

  // Scenario: cleanupClient runs while multiple clients have pending OPAQUE
  // sessions. The `if (key.startsWith(...))` false branch engages for the
  // OTHER clients' entries — only the target client's sessions are removed.
  describe("cleanupClient with multiple clients' pending sessions", () => {
    test("only removes the target client's pending sessions", async () => {
      await adapter.handleRegStart({
        clientId: "alpha",
        user: "user-a",
        clientNonce: "nonce-a",
        regRequest: "req-a",
      });
      await adapter.handleRegStart({
        clientId: "beta",
        user: "user-b",
        clientNonce: "nonce-b",
        regRequest: "req-b",
      });
      expect(adapter._pendingSessions.size).toBe(2);
      adapter.cleanupClient("alpha");
      expect(adapter._pendingSessions.size).toBe(1);
      const remainingKeys = [...adapter._pendingSessions.keys()];
      expect(remainingKeys[0].startsWith("beta:")).toBe(true);
    });
  });

  // ============================================================================
  // opaqueLib delegation: integrators plug in a real OPAQUE library (e.g.
  // `@cloudflare/opaque-ts`). The handlers must forward to the library's
  // serverRegistrationStart / serverAuthStart / serverAuthFinish and
  // include the canonical-binding context derived from the nonces and ts.
  // ============================================================================
  describe("opaqueLib delegation", () => {
    test("handleRegStart delegates to opaqueLib.serverRegistrationStart and returns base64 response", async () => {
      const lib = {
        serverRegistrationStart: jest.fn(async (req, sid, ctx) => Buffer.from("OPAQUE_REG_RESP_BYTES")),
      };
      const libAdapter = createOpaqueAdapter({ opaqueLib: lib });
      libAdapter._defaultUserStore.clear();
      const result = await libAdapter.handleRegStart({
        clientId: "lib-c",
        user: "lib-u",
        clientNonce: "cn",
        regRequest: Buffer.from("REG_REQ_BYTES").toString("base64"),
      });
      expect(lib.serverRegistrationStart).toHaveBeenCalled();
      expect(result.regResponse).toBe(Buffer.from("OPAQUE_REG_RESP_BYTES").toString("base64"));
    });

    test("handleAuthStart delegates to opaqueLib.serverAuthStart and returns base64 oprfResponse", async () => {
      const lib = {
        serverAuthStart: jest.fn(async () => Buffer.from("OPRF_BYTES")),
      };
      const libAdapter = createOpaqueAdapter({ opaqueLib: lib });
      libAdapter._defaultUserStore.clear();
      // Pre-register a user record directly
      await new Promise((resolve, reject) => {
        const ret = libAdapter._defaultUserStore.set("lib-auth-u", {
          username: "lib-auth-u",
          opaqueRecord: Buffer.from("REC").toString("base64"),
          roles: ["user"],
          permissions: {},
          createdAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const result = await libAdapter.handleAuthStart({
        clientId: "lib-c",
        user: "lib-auth-u",
        clientNonce: "cn",
      });
      expect(lib.serverAuthStart).toHaveBeenCalled();
      expect(result.oprfResponse).toBe(Buffer.from("OPRF_BYTES").toString("base64"));
    });

    test("handleAuthFinish delegates to opaqueLib.serverAuthFinish and returns serverProof", async () => {
      const lib = {
        serverAuthStart: jest.fn(async () => Buffer.from("OPRF_BYTES")),
        serverAuthFinish: jest.fn(async () => ({
          serverProof: Buffer.from("PROOF_BYTES"),
          sessionKey: Buffer.from("SK_BYTES"),
        })),
      };
      const libAdapter = createOpaqueAdapter({ opaqueLib: lib });
      libAdapter._defaultUserStore.clear();
      libAdapter._defaultUserStore.set("lib-fin-u", {
        username: "lib-fin-u",
        opaqueRecord: Buffer.from("REC").toString("base64"),
        roles: ["user"],
        permissions: {},
        createdAt: Date.now(),
      });
      await libAdapter.handleAuthStart({
        clientId: "lib-c",
        user: "lib-fin-u",
        clientNonce: "cn",
      });
      const result = await libAdapter.handleAuthFinish({
        clientId: "lib-c",
        user: "lib-fin-u",
        clientNonce: "cn",
        clientAuth: Buffer.from("CA").toString("base64"),
      });
      expect(lib.serverAuthFinish).toHaveBeenCalled();
      expect(result.serverProof).toBe(Buffer.from("PROOF_BYTES").toString("base64"));
    });

    test("handleAuthFinish wraps opaqueLib.serverAuthFinish errors as INVALID_PROOF", async () => {
      const lib = {
        serverAuthStart: jest.fn(async () => Buffer.from("OPRF")),
        serverAuthFinish: jest.fn(async () => {
          throw new Error("invalid client proof");
        }),
      };
      const libAdapter = createOpaqueAdapter({ opaqueLib: lib });
      libAdapter._defaultUserStore.clear();
      libAdapter._defaultUserStore.set("lib-bad-u", {
        username: "lib-bad-u",
        opaqueRecord: Buffer.from("REC").toString("base64"),
        roles: ["user"],
        permissions: {},
        createdAt: Date.now(),
      });
      await libAdapter.handleAuthStart({
        clientId: "lib-c",
        user: "lib-bad-u",
        clientNonce: "cn",
      });
      await expect(
        libAdapter.handleAuthFinish({
          clientId: "lib-c",
          user: "lib-bad-u",
          clientNonce: "cn",
          clientAuth: Buffer.from("CA").toString("base64"),
        }),
      ).rejects.toMatchObject({ code: OpaqueError.INVALID_PROOF });
      // Pending session should be deleted on lib error
      expect(libAdapter._pendingSessions.size).toBe(0);
    });
  });

  // ============================================================================
  // Session expiry: when Date.now() exceeds session.expiresAt the handler
  // must reject with NONCE_EXPIRED and clear the pending session.
  // ============================================================================
  describe("Session expiry in finish handlers", () => {
    test("handleRegFinish rejects when session is past expiresAt", async () => {
      const a = createOpaqueAdapter({ nonceExpiry: 1000 });
      a._defaultUserStore.clear();
      await a.handleRegStart({
        clientId: "exp-c",
        user: "exp-u",
        clientNonce: "n",
        regRequest: "rq",
      });
      // Manually expire by mutating expiresAt
      const key = `exp-c:exp-u`;
      const ses = a._pendingSessions.get(key);
      ses.expiresAt = Date.now() - 1000;
      await expect(
        a.handleRegFinish({
          clientId: "exp-c",
          user: "exp-u",
          clientNonce: "n",
          regRecord: "rec",
        }),
      ).rejects.toMatchObject({ code: OpaqueError.NONCE_EXPIRED });
      expect(a._pendingSessions.has(key)).toBe(false);
    });

    test("handleAuthFinish rejects when session is past expiresAt", async () => {
      const a = createOpaqueAdapter({ nonceExpiry: 1000 });
      a._defaultUserStore.clear();
      // Pre-register a user
      a._defaultUserStore.set("aexp-u", {
        username: "aexp-u",
        opaqueRecord: "REC",
        roles: ["user"],
        permissions: {},
        createdAt: Date.now(),
      });
      await a.handleAuthStart({
        clientId: "aexp-c",
        user: "aexp-u",
        clientNonce: "n",
      });
      const key = `aexp-c:aexp-u`;
      const ses = a._pendingSessions.get(key);
      ses.expiresAt = Date.now() - 1000;
      await expect(
        a.handleAuthFinish({
          clientId: "aexp-c",
          user: "aexp-u",
          clientNonce: "n",
          clientAuth: "proof",
        }),
      ).rejects.toMatchObject({ code: OpaqueError.NONCE_EXPIRED });
      expect(a._pendingSessions.has(key)).toBe(false);
    });
  });

  // ============================================================================
  // Default-shape userData: when the stored record lacks roles/permissions
  // (e.g. legacy migration), the `userData.roles || ["user"]` and
  // `userData.permissions || {}` short-circuits engage.
  // ============================================================================
  describe("Default principal shape when userData is minimal", () => {
    test("falls back to ['user'] role and {} permissions when missing", async () => {
      adapter._defaultUserStore.set("min-u", {
        username: "min-u",
        opaqueRecord: "REC",
        // No roles, no permissions
        createdAt: Date.now(),
      });
      await adapter.handleAuthStart({
        clientId: "min-c",
        user: "min-u",
        clientNonce: "n",
      });
      const result = await adapter.handleAuthFinish({
        clientId: "min-c",
        user: "min-u",
        clientNonce: "n",
        clientAuth: "proof",
      });
      expect(result.assignedPrincipal.roles).toEqual(["user"]);
      expect(result.assignedPrincipal.permissions).toEqual({});
    });
  });
});
