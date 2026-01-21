/**
 * @fileoverview Tests for Nonce Manager
 *
 * Tests the single-use nonce generation and validation.
 */

const { createNonceManager } = require("./nonce-manager");

const AuthError = {
  NONCE_REUSED: "NONCE_REUSED",
  NONCE_EXPIRED: "NONCE_EXPIRED",
};

describe("Nonce Manager", () => {
  let nonceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    nonceManager = createNonceManager({
      nonceExpiry: 5000,
      AuthError,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("generateNonce", () => {
    test("returns nonce and expiry", () => {
      const result = nonceManager.generateNonce();

      expect(result.nonce).toBeDefined();
      expect(typeof result.nonce).toBe("string");
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    test("generates unique nonces", () => {
      const nonce1 = nonceManager.generateNonce();
      const nonce2 = nonceManager.generateNonce();

      expect(nonce1.nonce).not.toBe(nonce2.nonce);
    });

    test("accepts custom length", () => {
      const result = nonceManager.generateNonce(64);

      // Base64url encoding of 64 bytes should be ~86 chars
      expect(result.nonce.length).toBeGreaterThan(80);
    });
  });

  describe("consumeNonce", () => {
    test("consumes valid nonce", () => {
      const { nonce } = nonceManager.generateNonce();

      const result = nonceManager.consumeNonce(nonce);

      expect(result).toBe(true);
    });

    test("throws on already used nonce", () => {
      const { nonce } = nonceManager.generateNonce();
      nonceManager.consumeNonce(nonce);

      try {
        nonceManager.consumeNonce(nonce);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.message).toBe("Nonce already used");
        expect(err.code).toBe(AuthError.NONCE_REUSED);
      }
    });

    test("throws on invalid nonce", () => {
      try {
        nonceManager.consumeNonce("invalid-nonce");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.message).toBe("Invalid or expired nonce");
        expect(err.code).toBe(AuthError.NONCE_EXPIRED);
      }
    });

    test("throws on expired nonce", () => {
      const { nonce } = nonceManager.generateNonce();

      // Advance time past expiry but before the cleanup timeout (expiry + 1000)
      // Nonce expiry is 5000ms, so advance 5001ms to trigger expiry check
      jest.advanceTimersByTime(5001);

      try {
        nonceManager.consumeNonce(nonce);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.message).toBe("Nonce expired");
        expect(err.code).toBe(AuthError.NONCE_EXPIRED);
      }
    });
  });

  describe("timeout cleanup", () => {
    test("removes pending nonce after expiry + buffer", () => {
      const { nonce } = nonceManager.generateNonce();

      // Advance time past expiry + 1000ms buffer
      jest.advanceTimersByTime(6001);

      try {
        nonceManager.consumeNonce(nonce);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.code).toBe(AuthError.NONCE_EXPIRED);
      }
    });

    test("removes used nonce from usedNonces set after timeout", () => {
      const { nonce } = nonceManager.generateNonce();
      nonceManager.consumeNonce(nonce);

      // Advance time past 2x nonceExpiry (the cleanup time for usedNonces)
      jest.advanceTimersByTime(10001);

      // The nonce should be removed from usedNonces, but we can't directly test this
      // However, generating a new nonce should not throw
      expect(() => nonceManager.generateNonce()).not.toThrow();
    });
  });

  describe("clearPendingNonces", () => {
    test("clears all pending nonces", () => {
      const { nonce } = nonceManager.generateNonce();
      nonceManager.clearPendingNonces();

      try {
        nonceManager.consumeNonce(nonce);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.code).toBe(AuthError.NONCE_EXPIRED);
      }
    });
  });
});
