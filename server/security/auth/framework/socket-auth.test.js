/**
 * @fileoverview Tests for Socket Auth Manager
 *
 * Exercises the per-socket auth message dispatcher.  Existing tests
 * (`server/security/auth/index.test.js` and the
 * `handlers/auth-messages.test.js`) cover the OPAQUE/LDAP/MFA/WebAuthn/TOTP
 * branches; these tests focus on:
 *   - the key-recovery message dispatch paths
 *   - the error mapping when a handler throws (auth_error / *_fail / etc.)
 *   - the `twoOfThreeAdapter.cleanupClient` optional-method branch.
 */

const { createSocketAuthManager } = require("./socket-auth");
const { createAuthStateMachine, AuthTier } = require("../state-machine");
const { TwoOfThreeMessageType } = require("../mfa/two-of-three");
const { OpaqueMessageType } = require("../adapters/opaque");

function noopAdapter(overrides = {}) {
  return {
    cleanupClient: jest.fn(),
    ...overrides,
  };
}

function authedMachine() {
  const sm = createAuthStateMachine();
  sm.startAuth("opaque");
  sm.completeAuth({ userId: "u1", roles: ["user"], permissions: {} });
  sm.startMFA(["totp"]);
  sm.completeMFA("totp");
  return sm;
}

function makeManager({ twoOfThreeAdapter, stateMachine } = {}) {
  return createSocketAuthManager({
    clientId: "cid",
    stateMachine: stateMachine || authedMachine(),
    adapters: {
      opaqueAdapter: noopAdapter(),
      ldapAdapter: noopAdapter({ handleAuth: jest.fn() }),
      webauthnAdapter: noopAdapter(),
      totpAdapter: noopAdapter({ isEnabled: jest.fn(async () => false) }),
      twoOfThreeAdapter: twoOfThreeAdapter || noopAdapter(),
    },
    mfaMethods: [],
    callbacks: {
      onAuthSuccess: jest.fn(),
      onAuthFailure: jest.fn(),
      onMFASuccess: jest.fn(),
      onKeyRecoverySuccess: jest.fn(),
    },
  });
}

describe("Socket auth manager — key recovery dispatch", () => {
  // Scenario: an elevated user starts key-recovery enrollment. The
  // dispatcher must route ENROLLMENT_START to the key-recovery handler.
  test("routes ENROLLMENT_START to handleEnrollmentStart", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleEnrollmentStart: jest.fn(async () => ({
        type: "key_recovery_enrollment_challenge",
      })),
    });
    const manager = makeManager({ twoOfThreeAdapter });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.ENROLLMENT_START,
      {},
    );
    expect(result.type).toBe("key_recovery_enrollment_challenge");
    expect(twoOfThreeAdapter.handleEnrollmentStart).toHaveBeenCalled();
  });

  test("routes ENROLLMENT_FINISH to handleEnrollmentFinish", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleEnrollmentFinish: jest.fn(async () => ({
        type: "key_recovery_enrollment_ok",
      })),
    });
    const manager = makeManager({ twoOfThreeAdapter });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.ENROLLMENT_FINISH,
      { encShares: ["s1", "s2", "s3"], shareIndices: [0, 1, 2], proof: "P" },
    );
    expect(result.type).toBe("key_recovery_enrollment_ok");
  });

  test("routes RECOVERY_START to handleRecoveryStart", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleRecoveryStart: jest.fn(async () => ({ type: "key_recovery_start" })),
    });
    const manager = makeManager({ twoOfThreeAdapter });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.RECOVERY_START,
      { factors: ["oauth", "webauthn", "totp"] },
    );
    expect(result.type).toBe("key_recovery_start");
  });

  test("routes ROTATION_START to handleRotation", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleRotation: jest.fn(async () => ({ type: "key_recovery_rotation_ok" })),
    });
    const manager = makeManager({ twoOfThreeAdapter });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.ROTATION_START,
      { shareId: "S3", encShare: "X", reason: "device-lost" },
    );
    expect(result.type).toBe("key_recovery_rotation_ok");
  });

  // Scenario: a Tier 2 user with no pending recovery sends a cancel. The
  // dispatcher routes to handleCancel and forwards the synchronous result.
  test("routes key_recovery_cancel to handleCancel (sync)", () => {
    const manager = makeManager();
    const result = manager.handleMessage("key_recovery_cancel", {});
    // Returns a Promise wrapping the sync handler result
    return result.then((r) => {
      expect(r.type).toBe("key_recovery_cancel_fail");
    });
  });

  test("routes key_recovery_status to handleStatus (sync)", async () => {
    const manager = makeManager();
    const result = await manager.handleMessage("key_recovery_status", {});
    expect(result.type).toBe("key_recovery_status");
    expect(result.pending).toBe(false);
  });

  // Scenario: a recovery completes via the dispatcher. The wrapper calls
  // RECOVERY_COMPLETE which exercises the L91 dispatch arm.
  test("routes RECOVERY_COMPLETE to handleRecoveryComplete", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleRecoveryComplete: jest.fn(async () => ({
        type: "key_recovery_ok",
        usedFactors: ["webauthn", "totp"],
      })),
    });
    const sm = authedMachine();
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const manager = makeManager({ twoOfThreeAdapter, stateMachine: sm });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.RECOVERY_COMPLETE,
      { proof: "P", usedFactors: ["webauthn", "totp"] },
    );
    expect(result.type).toBe("key_recovery_ok");
  });
});

describe("Socket auth manager — error-path mapping", () => {
  // Scenario: an OPAQUE auth-start throws a plain Error (no .code). The
  // dispatcher must map to `auth_start_fail` with error="AUTH_ERROR" — the
  // `err.code || "AUTH_ERROR"` short-circuit's RHS arm engages.
  test("auth_start failure falls back to AUTH_ERROR when err.code absent", async () => {
    const onAuthFailure = jest.fn();
    const opaqueAdapter = noopAdapter({
      handleAuthStart: jest.fn(async () => {
        throw new Error("plain error no code");
      }),
    });
    const sm = createAuthStateMachine();
    const manager = createSocketAuthManager({
      clientId: "cid-err",
      stateMachine: sm,
      adapters: {
        opaqueAdapter,
        ldapAdapter: noopAdapter(),
        webauthnAdapter: noopAdapter(),
        totpAdapter: noopAdapter({ isEnabled: jest.fn(async () => false) }),
        twoOfThreeAdapter: noopAdapter(),
      },
      mfaMethods: [],
      callbacks: {
        onAuthSuccess: jest.fn(),
        onAuthFailure,
        onMFASuccess: jest.fn(),
        onKeyRecoverySuccess: jest.fn(),
      },
    });
    const result = await manager.handleMessage(
      OpaqueMessageType.AUTH_START,
      { user: "u", clientNonce: "n" },
    );
    expect(result.type).toBe("opaque_auth_fail");
    expect(result.error).toBe("AUTH_ERROR");
    expect(onAuthFailure).toHaveBeenCalled();
  });

  // Scenario: a key-recovery rotation handler throws a coded error. The
  // dispatcher's outer catch maps to `key_recovery_rotation_fail` and the
  // err.code is preserved.
  test("rotation failure preserves err.code", async () => {
    const twoOfThreeAdapter = noopAdapter({
      handleRotation: jest.fn(async () => {
        const e = new Error("share missing");
        e.code = "INVALID_FACTOR";
        throw e;
      }),
    });
    const manager = makeManager({ twoOfThreeAdapter });
    const result = await manager.handleMessage(
      TwoOfThreeMessageType.ROTATION_START,
      { shareId: "S3", encShare: "X" },
    );
    expect(result.type).toBe("key_recovery_rotation_fail");
    expect(result.error).toBe("INVALID_FACTOR");
  });

  // Scenario: dispatcher receives a totally unknown message type — falls
  // through the if-chain and returns auth_error.
  test("unknown message type returns auth_error", async () => {
    const manager = makeManager();
    const result = await manager.handleMessage("unknown_type", {});
    expect(result.type).toBe("auth_error");
    expect(result.error).toBe("UNKNOWN_MESSAGE_TYPE");
  });
});

describe("Socket auth manager — cleanup branch", () => {
  // Scenario: the twoOfThreeAdapter has no cleanupClient method (older
  // version or stub). The cleanup() guard must engage without throwing.
  test("cleanup is a no-op when twoOfThreeAdapter.cleanupClient is absent", () => {
    const twoOfThreeAdapter = {}; // No cleanupClient
    const manager = makeManager({ twoOfThreeAdapter });
    expect(() => manager.cleanup()).not.toThrow();
  });

  // Scenario: the twoOfThreeAdapter has cleanupClient — it must be invoked.
  test("cleanup invokes twoOfThreeAdapter.cleanupClient when present", () => {
    const twoOfThreeAdapter = { cleanupClient: jest.fn() };
    const manager = makeManager({ twoOfThreeAdapter });
    manager.cleanup();
    expect(twoOfThreeAdapter.cleanupClient).toHaveBeenCalledWith("cid");
  });
});

describe("Socket auth manager — state helpers", () => {
  test("getState/getTier/isAuthenticated/meetsRequirement/authorize", () => {
    const manager = makeManager();
    expect(manager.getState().isAuthenticated).toBe(true);
    expect(manager.getTier()).toBe(AuthTier.ELEVATED);
    expect(manager.isAuthenticated()).toBe(true);
    expect(manager.meetsRequirement(AuthTier.BASIC)).toBe(true);
    expect(manager.meetsRequirement(AuthTier.HIGH_SECURITY)).toBe(false);
    const authz = manager.authorize("some-action");
    expect(authz.allowed).toBe(true);
  });

  test("authorize denies a guest", () => {
    const sm = createAuthStateMachine();
    const manager = makeManager({ stateMachine: sm });
    const authz = manager.authorize("some-action");
    expect(authz.allowed).toBe(false);
    expect(authz.reason).toBe("NOT_AUTHENTICATED");
  });
});
