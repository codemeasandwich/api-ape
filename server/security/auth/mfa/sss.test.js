/**
 * @fileoverview Tests for Shamir Secret Sharing (SSS) Utilities
 * @module server/security/auth/mfa/sss.test
 */

"use strict";

const {
  split,
  combine,
  serializeShare,
  deserializeShare,
  verifyShareFormat,
  generateSecret,
  SSSError,
  _gfMul,
  _gfDiv,
  _gfAdd,
  _evaluatePolynomial,
  _lagrangeInterpolate,
} = require("./sss");

describe("SSS Utilities", () => {
  // ============================================================
  // GF(256) Arithmetic Tests
  // ============================================================

  describe("GF(256) Arithmetic", () => {
    test("gfAdd is commutative", () => {
      expect(_gfAdd(0x53, 0xca)).toBe(_gfAdd(0xca, 0x53));
    });

    test("gfAdd with zero returns same value", () => {
      expect(_gfAdd(0x53, 0)).toBe(0x53);
      expect(_gfAdd(0, 0xca)).toBe(0xca);
    });

    test("gfAdd with self returns zero", () => {
      expect(_gfAdd(0x53, 0x53)).toBe(0);
    });

    test("gfMul is commutative", () => {
      expect(_gfMul(0x53, 0xca)).toBe(_gfMul(0xca, 0x53));
    });

    test("gfMul with zero returns zero", () => {
      expect(_gfMul(0x53, 0)).toBe(0);
      expect(_gfMul(0, 0xca)).toBe(0);
    });

    test("gfMul with one returns same value", () => {
      expect(_gfMul(0x53, 1)).toBe(0x53);
      expect(_gfMul(1, 0xca)).toBe(0xca);
    });

    test("gfDiv by one returns same value", () => {
      expect(_gfDiv(0x53, 1)).toBe(0x53);
    });

    test("gfDiv of zero returns zero", () => {
      expect(_gfDiv(0, 0x53)).toBe(0);
    });

    test("gfDiv by zero throws error", () => {
      expect(() => _gfDiv(0x53, 0)).toThrow();
    });

    test("gfMul and gfDiv are inverse operations", () => {
      const a = 0x53;
      const b = 0xca;
      const product = _gfMul(a, b);
      expect(_gfDiv(product, b)).toBe(a);
      expect(_gfDiv(product, a)).toBe(b);
    });
  });

  // ============================================================
  // Polynomial Operations Tests
  // ============================================================

  describe("Polynomial Operations", () => {
    test("evaluatePolynomial with constant returns constant", () => {
      const coefficients = new Uint8Array([42]);
      expect(_evaluatePolynomial(coefficients, 0)).toBe(42);
      expect(_evaluatePolynomial(coefficients, 1)).toBe(42);
      expect(_evaluatePolynomial(coefficients, 255)).toBe(42);
    });

    test("evaluatePolynomial f(x) = a + bx at x=0 returns a", () => {
      const coefficients = new Uint8Array([42, 17]);
      expect(_evaluatePolynomial(coefficients, 0)).toBe(42);
    });

    test("lagrangeInterpolate recovers constant function", () => {
      const points = [
        { x: 1, y: 42 },
        { x: 2, y: 42 },
      ];
      expect(_lagrangeInterpolate(points)).toBe(42);
    });

    test("lagrangeInterpolate recovers linear function at x=0", () => {
      // f(x) = 5 + 3x (in GF(256))
      // f(0) = 5, f(1) = 5 XOR 3 = 6, f(2) = 5 XOR (3*2) = 5 XOR 6 = 3
      const points = [
        { x: 1, y: _gfAdd(5, _gfMul(3, 1)) },
        { x: 2, y: _gfAdd(5, _gfMul(3, 2)) },
      ];
      expect(_lagrangeInterpolate(points)).toBe(5);
    });
  });

  // ============================================================
  // Split Function Tests
  // ============================================================

  describe("split()", () => {
    test("splits secret into correct number of shares", () => {
      const secret = Buffer.from("test-secret");
      const shares = split(secret, 2, 3);

      expect(shares).toHaveLength(3);
    });

    test("each share has correct index (1-indexed)", () => {
      const secret = Buffer.from("test");
      const shares = split(secret, 2, 5);

      expect(shares.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    });

    test("each share has same data length as secret", () => {
      const secret = Buffer.from("my-secret-key-32-bytes-long!!!!!");
      const shares = split(secret, 3, 5);

      for (const share of shares) {
        expect(share.data.length).toBe(secret.length);
      }
    });

    test("generates different shares for same secret (randomized)", () => {
      const secret = Buffer.from("same-secret");
      const shares1 = split(secret, 2, 3);
      const shares2 = split(secret, 2, 3);

      // At least one share should differ due to random coefficients
      const differ = shares1.some(
        (s1, i) => !s1.data.equals(shares2[i].data)
      );
      expect(differ).toBe(true);
    });

    test("throws on threshold < 2", () => {
      const secret = Buffer.from("test");

      expect(() => split(secret, 1, 3)).toThrow();
      try {
        split(secret, 1, 3);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_THRESHOLD);
      }
    });

    test("throws on totalShares < threshold", () => {
      const secret = Buffer.from("test");

      expect(() => split(secret, 5, 3)).toThrow();
      try {
        split(secret, 5, 3);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SHARE_COUNT);
      }
    });

    test("throws on totalShares > 255", () => {
      const secret = Buffer.from("test");

      expect(() => split(secret, 2, 256)).toThrow();
      try {
        split(secret, 2, 256);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SHARE_COUNT);
      }
    });

    test("handles single-byte secrets", () => {
      const secret = Buffer.from([42]);
      const shares = split(secret, 2, 3);

      expect(shares).toHaveLength(3);
      expect(shares[0].data.length).toBe(1);
    });

    test("handles large secrets (1KB)", () => {
      const secret = Buffer.alloc(1024);
      for (let i = 0; i < secret.length; i++) {
        secret[i] = i % 256;
      }

      const shares = split(secret, 3, 5);

      expect(shares).toHaveLength(5);
      expect(shares[0].data.length).toBe(1024);
    });

    test("handles string input", () => {
      const secret = "my-string-secret";
      const shares = split(secret, 2, 3);

      expect(shares).toHaveLength(3);
      expect(shares[0].data.length).toBe(Buffer.from(secret).length);
    });

    test("handles Uint8Array input", () => {
      const secret = new Uint8Array([1, 2, 3, 4, 5]);
      const shares = split(secret, 2, 3);

      expect(shares).toHaveLength(3);
      expect(shares[0].data.length).toBe(5);
    });

    test("throws on empty secret", () => {
      expect(() => split(Buffer.alloc(0), 2, 3)).toThrow();
      try {
        split(Buffer.alloc(0), 2, 3);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SECRET);
      }
    });

    test("throws on invalid secret type", () => {
      expect(() => split(12345, 2, 3)).toThrow();
      try {
        split(12345, 2, 3);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SECRET);
      }
    });

    test("supports maximum 255 shares", () => {
      const secret = Buffer.from("test");
      const shares = split(secret, 2, 255);

      expect(shares).toHaveLength(255);
      expect(shares[254].index).toBe(255);
    });
  });

  // ============================================================
  // Combine Function Tests
  // ============================================================

  describe("combine()", () => {
    test("reconstructs with exact threshold shares (2-of-3)", () => {
      const secret = Buffer.from("hello-world");
      const shares = split(secret, 2, 3);

      const reconstructed = combine([shares[0], shares[1]]);
      expect(reconstructed.equals(secret)).toBe(true);
    });

    test("reconstructs with more than threshold shares", () => {
      const secret = Buffer.from("hello-world");
      const shares = split(secret, 2, 3);

      const reconstructed = combine(shares);
      expect(reconstructed.equals(secret)).toBe(true);
    });

    test("reconstructs with any combination of threshold shares", () => {
      const secret = Buffer.from("secret-key");
      const shares = split(secret, 2, 3);

      // Test all 2-share combinations
      expect(combine([shares[0], shares[1]]).equals(secret)).toBe(true);
      expect(combine([shares[0], shares[2]]).equals(secret)).toBe(true);
      expect(combine([shares[1], shares[2]]).equals(secret)).toBe(true);
    });

    test("reconstructs with higher threshold (3-of-5)", () => {
      const secret = Buffer.from("higher-threshold-secret");
      const shares = split(secret, 3, 5);

      // Any 3 shares should work
      expect(combine([shares[0], shares[2], shares[4]]).equals(secret)).toBe(
        true
      );
      expect(combine([shares[1], shares[3], shares[4]]).equals(secret)).toBe(
        true
      );
    });

    test("fails with less than threshold shares", () => {
      const secret = Buffer.from("test");
      const shares = split(secret, 3, 5);

      // Only 2 shares when threshold is 3
      const result = combine([shares[0], shares[1]]);
      // Result should NOT equal original (insufficient shares = garbage)
      expect(result.equals(secret)).toBe(false);
    });

    test("order of shares does not matter", () => {
      const secret = Buffer.from("order-test");
      const shares = split(secret, 2, 3);

      const result1 = combine([shares[0], shares[1]]);
      const result2 = combine([shares[1], shares[0]]);

      expect(result1.equals(result2)).toBe(true);
      expect(result1.equals(secret)).toBe(true);
    });

    test("throws on empty array", () => {
      expect(() => combine([])).toThrow();
      try {
        combine([]);
      } catch (err) {
        expect(err.code).toBe(SSSError.INSUFFICIENT_SHARES);
      }
    });

    test("throws on single share", () => {
      const shares = split(Buffer.from("test"), 2, 3);

      expect(() => combine([shares[0]])).toThrow();
      try {
        combine([shares[0]]);
      } catch (err) {
        expect(err.code).toBe(SSSError.INSUFFICIENT_SHARES);
      }
    });

    test("throws on duplicate share indices", () => {
      const shares = split(Buffer.from("test"), 2, 3);
      const duplicated = [shares[0], { ...shares[0] }];

      expect(() => combine(duplicated)).toThrow();
      try {
        combine(duplicated);
      } catch (err) {
        expect(err.code).toBe(SSSError.DUPLICATE_SHARE_INDEX);
      }
    });

    test("throws on invalid share index (0)", () => {
      const share = { index: 0, data: Buffer.from([1, 2, 3]) };

      expect(() => combine([share, { index: 1, data: Buffer.from([4, 5, 6]) }])).toThrow();
      try {
        combine([share, { index: 1, data: Buffer.from([4, 5, 6]) }]);
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SHARE_FORMAT);
      }
    });

    test("throws on invalid share index (> 255)", () => {
      const share = { index: 256, data: Buffer.from([1, 2, 3]) };

      expect(() => combine([share, { index: 1, data: Buffer.from([4, 5, 6]) }])).toThrow();
    });

    test("throws on mismatched share data lengths", () => {
      const share1 = { index: 1, data: Buffer.from([1, 2, 3]) };
      const share2 = { index: 2, data: Buffer.from([4, 5]) };

      expect(() => combine([share1, share2])).toThrow();
      try {
        combine([share1, share2]);
      } catch (err) {
        expect(err.code).toBe(SSSError.SHARE_INDEX_MISMATCH);
      }
    });

    test("throws on missing data property", () => {
      expect(() => combine([{ index: 1 }, { index: 2 }])).toThrow();
    });

    test("handles Uint8Array share data", () => {
      const secret = Buffer.from("test");
      const shares = split(secret, 2, 3);

      // Convert to Uint8Array
      const uint8Shares = shares.map((s) => ({
        index: s.index,
        data: new Uint8Array(s.data),
      }));

      const reconstructed = combine([uint8Shares[0], uint8Shares[1]]);
      expect(reconstructed.equals(secret)).toBe(true);
    });
  });

  // ============================================================
  // Serialization Tests
  // ============================================================

  describe("serializeShare()", () => {
    test("produces base64url string", () => {
      const shares = split(Buffer.from("test"), 2, 3);
      const serialized = serializeShare(shares[0]);

      expect(typeof serialized).toBe("string");
      // Base64url should not contain + / =
      expect(serialized).not.toMatch(/[+/=]/);
    });

    test("preserves share index in serialization", () => {
      const shares = split(Buffer.from("test"), 2, 3);

      for (const share of shares) {
        const serialized = serializeShare(share);
        const deserialized = deserializeShare(serialized);
        expect(deserialized.index).toBe(share.index);
      }
    });

    test("throws on invalid share format", () => {
      expect(() => serializeShare(null)).toThrow();
      expect(() => serializeShare({ index: 1 })).toThrow();
      expect(() => serializeShare({ data: Buffer.from([1]) })).toThrow();
    });
  });

  describe("deserializeShare()", () => {
    test("reverses serialization", () => {
      const shares = split(Buffer.from("test-secret"), 2, 3);

      for (const share of shares) {
        const serialized = serializeShare(share);
        const deserialized = deserializeShare(serialized);

        expect(deserialized.index).toBe(share.index);
        expect(deserialized.data.equals(share.data)).toBe(true);
      }
    });

    test("round-trip preserves secret reconstruction", () => {
      const secret = Buffer.from("round-trip-test");
      const shares = split(secret, 2, 3);

      // Serialize and deserialize
      const serialized = shares.map(serializeShare);
      const deserialized = serialized.map(deserializeShare);

      // Should still reconstruct correctly
      const reconstructed = combine([deserialized[0], deserialized[2]]);
      expect(reconstructed.equals(secret)).toBe(true);
    });

    test("throws on empty string", () => {
      expect(() => deserializeShare("")).toThrow();
      try {
        deserializeShare("");
      } catch (err) {
        expect(err.code).toBe(SSSError.INVALID_SHARE_FORMAT);
      }
    });

    test("throws on non-string input", () => {
      expect(() => deserializeShare(123)).toThrow();
      expect(() => deserializeShare(null)).toThrow();
    });

    test("throws on invalid base64url", () => {
      expect(() => deserializeShare("!!!invalid!!!")).toThrow();
    });

    test("throws on too short serialized data", () => {
      // Only 1 byte (just index, no data)
      const tooShort = Buffer.from([1]).toString("base64url");
      expect(() => deserializeShare(tooShort)).toThrow();
    });
  });

  describe("verifyShareFormat()", () => {
    test("accepts valid shares", () => {
      const shares = split(Buffer.from("test"), 2, 3);

      for (const share of shares) {
        expect(verifyShareFormat(share)).toBe(true);
      }
    });

    test("accepts valid serialized shares", () => {
      const shares = split(Buffer.from("test"), 2, 3);
      const serialized = shares.map(serializeShare);

      for (const s of serialized) {
        expect(verifyShareFormat(s)).toBe(true);
      }
    });

    test("rejects invalid index (0)", () => {
      expect(verifyShareFormat({ index: 0, data: Buffer.from([1]) })).toBe(
        false
      );
    });

    test("rejects invalid index (> 255)", () => {
      expect(verifyShareFormat({ index: 256, data: Buffer.from([1]) })).toBe(
        false
      );
    });

    test("rejects empty data", () => {
      expect(verifyShareFormat({ index: 1, data: Buffer.alloc(0) })).toBe(
        false
      );
    });

    test("rejects missing properties", () => {
      expect(verifyShareFormat({ index: 1 })).toBe(false);
      expect(verifyShareFormat({ data: Buffer.from([1]) })).toBe(false);
      expect(verifyShareFormat({})).toBe(false);
    });

    test("rejects invalid serialized strings", () => {
      expect(verifyShareFormat("")).toBe(false);
      // String with invalid base64url characters
      expect(verifyShareFormat("!!!invalid!!!")).toBe(false);
      expect(verifyShareFormat("has spaces")).toBe(false);
      expect(verifyShareFormat("has+plus")).toBe(false);
    });
  });

  // ============================================================
  // generateSecret Tests
  // ============================================================

  describe("generateSecret()", () => {
    test("generates 32-byte secret by default", () => {
      const secret = generateSecret();
      expect(secret.length).toBe(32);
    });

    test("generates secret of specified length", () => {
      expect(generateSecret(16).length).toBe(16);
      expect(generateSecret(64).length).toBe(64);
      expect(generateSecret(1).length).toBe(1);
    });

    test("generates different secrets each time", () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1.equals(s2)).toBe(false);
    });

    test("generates Buffer type", () => {
      const secret = generateSecret();
      expect(Buffer.isBuffer(secret)).toBe(true);
    });
  });

  // ============================================================
  // Integration / End-to-End Tests
  // ============================================================

  describe("Integration Tests", () => {
    test("full 2-of-3 flow with serialization", () => {
      // 1. Generate a secret
      const secret = generateSecret(32);

      // 2. Split into 3 shares
      const shares = split(secret, 2, 3);

      // 3. Serialize for storage
      const serializedShares = shares.map(serializeShare);

      // 4. Simulate storing and retrieving
      const storedS1 = serializedShares[0];
      const storedS3 = serializedShares[2];

      // 5. Deserialize
      const retrievedS1 = deserializeShare(storedS1);
      const retrievedS3 = deserializeShare(storedS3);

      // 6. Combine any 2 shares
      const reconstructed = combine([retrievedS1, retrievedS3]);

      // 7. Verify
      expect(reconstructed.equals(secret)).toBe(true);
    });

    test("3-of-5 flow with various combinations", () => {
      const secret = Buffer.from("enterprise-grade-secret-key!!!!!");
      const shares = split(secret, 3, 5);

      // Test all 3-share combinations (C(5,3) = 10)
      const combinations = [
        [0, 1, 2],
        [0, 1, 3],
        [0, 1, 4],
        [0, 2, 3],
        [0, 2, 4],
        [0, 3, 4],
        [1, 2, 3],
        [1, 2, 4],
        [1, 3, 4],
        [2, 3, 4],
      ];

      for (const combo of combinations) {
        const selectedShares = combo.map((i) => shares[i]);
        const reconstructed = combine(selectedShares);
        expect(reconstructed.equals(secret)).toBe(true);
      }
    });

    test("handles binary data with all byte values", () => {
      // Create secret with every byte value
      const secret = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        secret[i] = i;
      }

      const shares = split(secret, 2, 3);
      const reconstructed = combine([shares[0], shares[2]]);

      expect(reconstructed.equals(secret)).toBe(true);
    });

    test("threshold equals total shares (n-of-n)", () => {
      const secret = Buffer.from("all-or-nothing");
      const shares = split(secret, 5, 5);

      // All 5 shares required
      const reconstructed = combine(shares);
      expect(reconstructed.equals(secret)).toBe(true);

      // 4 shares should produce wrong result
      const partial = combine(shares.slice(0, 4));
      expect(partial.equals(secret)).toBe(false);
    });
  });
});
