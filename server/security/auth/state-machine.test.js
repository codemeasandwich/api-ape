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
});
