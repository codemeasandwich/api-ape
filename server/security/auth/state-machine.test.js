/**
 * @fileoverview Tests for Authentication State Machine
 */

const {
  createAuthStateMachine,
  AuthState,
  AuthTier,
  AuthError,
} = require("./state-machine");

describe("Auth State Machine", () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = createAuthStateMachine();
  });

  afterEach(() => {
    stateMachine.cleanup();
  });

  describe("Initial State", () => {
    test("starts in GUEST state", () => {
      const state = stateMachine.getState();
      expect(state.state).toBe(AuthState.GUEST);
      expect(state.tier).toBe(AuthTier.GUEST);
      expect(state.isAuthenticated).toBe(false);
    });

    test("has no principal initially", () => {
      const state = stateMachine.getState();
      expect(state.principal).toBeNull();
    });
  });

  describe("Authentication Flow", () => {
    test("can start authentication", () => {
      const result = stateMachine.startAuth("opaque");
      expect(result.state).toBe(AuthState.AUTHENTICATING);
      expect(result.method).toBe("opaque");
    });

    test("cannot start auth twice", () => {
      stateMachine.startAuth("opaque");
      expect(() => stateMachine.startAuth("opaque")).toThrow();
    });

    test("can complete authentication", () => {
      stateMachine.startAuth("opaque");
      const result = stateMachine.completeAuth({
        userId: "test-user",
        roles: ["user"],
      });

      expect(result.state).toBe(AuthState.AUTHENTICATED);
      expect(result.tier).toBe(AuthTier.BASIC);
      expect(result.principal.userId).toBe("test-user");
    });

    test("updates isAuthenticated after auth", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "test-user" });

      const state = stateMachine.getState();
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe("Failed Authentication", () => {
    test("can fail authentication", () => {
      stateMachine.startAuth("opaque");
      const result = stateMachine.failAuth("INVALID_PROOF");

      expect(result.state).toBe(AuthState.GUEST);
      expect(result.reason).toBe("INVALID_PROOF");
      expect(result.attempts).toBe(1);
    });

    test("tracks failed attempts", () => {
      for (let i = 0; i < 3; i++) {
        stateMachine.startAuth("opaque");
        stateMachine.failAuth("INVALID_PROOF");
      }

      expect(stateMachine.isLockedOut()).toBe(false);
    });

    test("locks out after max attempts", () => {
      const sm = createAuthStateMachine({ maxAttempts: 3 });

      for (let i = 0; i < 3; i++) {
        sm.startAuth("opaque");
        sm.failAuth("INVALID_PROOF");
      }

      expect(sm.isLockedOut()).toBe(true);
      sm.cleanup();
    });
  });

  describe("Nonce Management", () => {
    test("generates unique nonces", () => {
      const nonce1 = stateMachine.generateNonce();
      const nonce2 = stateMachine.generateNonce();

      expect(nonce1.nonce).toBeDefined();
      expect(nonce2.nonce).toBeDefined();
      expect(nonce1.nonce).not.toBe(nonce2.nonce);
    });

    test("nonces have expiry", () => {
      const nonce = stateMachine.generateNonce();
      expect(nonce.expiresAt).toBeGreaterThan(Date.now());
    });

    test("can consume valid nonce", () => {
      const { nonce } = stateMachine.generateNonce();
      expect(stateMachine.consumeNonce(nonce)).toBe(true);
    });

    test("cannot reuse consumed nonce", () => {
      const { nonce } = stateMachine.generateNonce();
      stateMachine.consumeNonce(nonce);
      expect(() => stateMachine.consumeNonce(nonce)).toThrow();
    });

    test("rejects invalid nonce", () => {
      expect(() => stateMachine.consumeNonce("invalid-nonce")).toThrow();
    });
  });

  describe("No Downgrade Rule", () => {
    test("cannot downgrade from authenticated", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "test-user" });

      expect(() => stateMachine.startAuth("opaque")).toThrow();
    });
  });

  describe("Invalid Transitions", () => {
    test("completeAuth throws when not in authenticating state", () => {
      // Try to complete auth from GUEST state
      expect(() => stateMachine.completeAuth({ userId: "test-user" }))
        .toThrow("Not in authenticating state");
    });
  });

  describe("Rate Limiting", () => {
    test("startAuth throws when locked out", () => {
      const sm = createAuthStateMachine({ maxAttempts: 3, lockoutDuration: 60000 });

      // Exhaust attempts to trigger lockout
      for (let i = 0; i < 3; i++) {
        sm.startAuth("opaque");
        sm.failAuth("INVALID_PROOF");
      }

      expect(sm.isLockedOut()).toBe(true);

      // Now try to start auth while locked out
      try {
        sm.startAuth("opaque");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.message).toBe("Too many authentication attempts");
        expect(err.code).toBe(AuthError.RATE_LIMITED);
        expect(err.lockoutRemaining).toBeGreaterThan(0);
      }

      sm.cleanup();
    });
  });

  describe("Auth Timeout", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("returns to GUEST after auth timeout", () => {
      const sm = createAuthStateMachine({ authTimeout: 1000 });

      sm.startAuth("opaque");
      expect(sm.getState().state).toBe(AuthState.AUTHENTICATING);

      // Advance time past the timeout
      jest.advanceTimersByTime(1001);

      expect(sm.getState().state).toBe(AuthState.GUEST);
      sm.cleanup();
    });
  });

  describe("MFA Flow", () => {
    test("can start MFA after authentication", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "test-user" });

      const result = stateMachine.startMFA(["webauthn", "totp"]);
      expect(result.state).toBe(AuthState.MFA_PENDING);
      expect(result.methods).toEqual(["webauthn", "totp"]);
    });

    test("cannot start MFA without authentication", () => {
      expect(() => stateMachine.startMFA(["webauthn"])).toThrow();
    });

    test("can complete MFA", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "test-user" });
      stateMachine.startMFA(["webauthn"]);

      const result = stateMachine.completeMFA("webauthn");
      expect(result.state).toBe(AuthState.ELEVATED);
      expect(result.tier).toBe(AuthTier.ELEVATED);
    });
  });

  describe("Tier Checking", () => {
    test("getTier returns correct tier", () => {
      expect(stateMachine.getTier()).toBe(AuthTier.GUEST);

      stateMachine.startAuth("opaque");
      expect(stateMachine.getTier()).toBe(AuthTier.GUEST); // Still guest while authenticating

      stateMachine.completeAuth({ userId: "test-user" });
      expect(stateMachine.getTier()).toBe(AuthTier.BASIC);
    });
  });

  describe("MFA Completion", () => {
    test("completeMFA sets principal metadata", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "mfa-user" });
      stateMachine.startMFA(["totp"]);

      const result = stateMachine.completeMFA("totp");

      expect(result.principal.mfaMethod).toBe("totp");
      expect(result.principal.elevatedAt).toBeDefined();
      expect(result.principal.elevatedAt).toBeLessThanOrEqual(Date.now());
    });

    test("completeMFA throws when not in MFA_PENDING state", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "test-user" });

      // Not in MFA_PENDING, should throw
      expect(() => stateMachine.completeMFA("totp")).toThrow("Not in MFA pending state");
    });
  });

  describe("Key Recovery Flow (Tier 3)", () => {
    test("can start key recovery from AUTHENTICATED state", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "recovery-user" });

      const result = stateMachine.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });

      expect(result.state).toBe(AuthState.KEY_RECOVERY_PENDING);
      expect(result.challenge).toBeDefined();
      expect(result.factors).toEqual(["oauth", "webauthn", "totp"]);
    });

    test("can start key recovery from ELEVATED state", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "elevated-user" });
      stateMachine.startMFA(["totp"]);
      stateMachine.completeMFA("totp");

      const result = stateMachine.startKeyRecovery({ factors: ["oauth", "webauthn"] });

      expect(result.state).toBe(AuthState.KEY_RECOVERY_PENDING);
    });

    test("startKeyRecovery throws when not authenticated", () => {
      expect(() => stateMachine.startKeyRecovery({}))
        .toThrow("Must be authenticated or elevated");
    });

    test("startKeyRecovery uses default factors if not provided", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "default-factors-user" });

      const result = stateMachine.startKeyRecovery({});

      expect(result.factors).toEqual(["oauth", "webauthn", "totp"]);
    });

    test("can complete key recovery and reach Tier 3", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "tier3-user" });
      stateMachine.startKeyRecovery({ factors: ["oauth", "webauthn"] });

      const result = stateMachine.completeKeyRecovery({
        proof: "valid-hmac-proof",
        usedFactors: ["oauth", "webauthn"],
      });

      expect(result.state).toBe(AuthState.HIGH_SECURITY);
      expect(result.tier).toBe(AuthTier.HIGH_SECURITY);
      expect(result.principal.keyRecoveryFactors).toEqual(["oauth", "webauthn"]);
      expect(result.principal.highSecurityAt).toBeDefined();
      expect(result.principal.tier).toBe(AuthTier.HIGH_SECURITY);
    });

    test("completeKeyRecovery throws when not in KEY_RECOVERY_PENDING state", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "not-recovery" });

      expect(() => stateMachine.completeKeyRecovery({ proof: "p", usedFactors: ["a", "b"] }))
        .toThrow("Not in key recovery pending state");
    });

    test("completeKeyRecovery validates proof is provided", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "no-proof-user" });
      stateMachine.startKeyRecovery({});

      expect(() => stateMachine.completeKeyRecovery({ usedFactors: ["a", "b"] }))
        .toThrow("Invalid key recovery proof");
    });

    test("completeKeyRecovery validates proof is a string", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "bad-proof-user" });
      stateMachine.startKeyRecovery({});

      expect(() => stateMachine.completeKeyRecovery({ proof: 123, usedFactors: ["a", "b"] }))
        .toThrow("Invalid key recovery proof");
    });

    test("completeKeyRecovery validates exactly 2 factors required", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "wrong-factors-user" });
      stateMachine.startKeyRecovery({});

      expect(() => stateMachine.completeKeyRecovery({ proof: "p", usedFactors: ["a"] }))
        .toThrow("Must use exactly 2 factors");

      // Need to restart since state was not changed
      stateMachine = createAuthStateMachine();
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "wrong-factors-user2" });
      stateMachine.startKeyRecovery({});

      expect(() => stateMachine.completeKeyRecovery({ proof: "p", usedFactors: ["a", "b", "c"] }))
        .toThrow("Must use exactly 2 factors");
    });

    test("can cancel key recovery and return to ELEVATED", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "cancel-user" });
      stateMachine.startMFA(["totp"]);
      stateMachine.completeMFA("totp");
      stateMachine.startKeyRecovery({});

      const result = stateMachine.cancelKeyRecovery();

      expect(result.state).toBe(AuthState.ELEVATED);
      expect(result.tier).toBe(AuthTier.ELEVATED);
    });

    test("cancelKeyRecovery throws when not in key recovery state", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "not-in-recovery" });

      expect(() => stateMachine.cancelKeyRecovery())
        .toThrow("No key recovery in progress");
    });

    test("getKeyRecoveryStatus returns null when no recovery pending", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "no-recovery-user" });

      expect(stateMachine.getKeyRecoveryStatus()).toBeNull();
    });

    test("getKeyRecoveryStatus returns status when recovery pending", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "status-user" });
      stateMachine.startKeyRecovery({ factors: ["oauth", "totp"] });

      const status = stateMachine.getKeyRecoveryStatus();

      expect(status.challenge).toBeDefined();
      expect(status.factors).toEqual(["oauth", "totp"]);
      expect(status.startedAt).toBeDefined();
      expect(status.verifiedFactors).toEqual([]);
    });

    test("completing key recovery clears pending status", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "clear-status-user" });
      stateMachine.startKeyRecovery({});
      stateMachine.completeKeyRecovery({ proof: "valid", usedFactors: ["a", "b"] });

      expect(stateMachine.getKeyRecoveryStatus()).toBeNull();
    });
  });

  describe("State Snapshot", () => {
    test("getState reflects elevated status", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "snapshot-user" });
      stateMachine.startMFA(["totp"]);
      stateMachine.completeMFA("totp");

      const state = stateMachine.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isElevated).toBe(true);
      expect(state.isHighSecurity).toBe(false);
    });

    test("getState reflects high security status", () => {
      stateMachine.startAuth("opaque");
      stateMachine.completeAuth({ userId: "high-sec-user" });
      stateMachine.startKeyRecovery({});
      stateMachine.completeKeyRecovery({ proof: "valid", usedFactors: ["a", "b"] });

      const state = stateMachine.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isElevated).toBe(true);
      expect(state.isHighSecurity).toBe(true);
    });
  });
});
