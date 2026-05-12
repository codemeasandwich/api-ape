/**
 * @fileoverview Tests for Cryptographic Utilities
 * @module server/security/auth/mfa/crypto-utils.test
 */

"use strict";

const {
  aeadEncrypt,
  aeadDecrypt,
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
  generateSalt,
  generateKey,
  timingSafeEqual,
  deriveKeyForPurpose,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  CryptoError,
} = require("./crypto-utils");

const crypto = require("crypto");

describe("Crypto Utilities", () => {
  // ============================================================
  // AEAD Encryption Tests
  // ============================================================

  describe("aeadEncrypt()", () => {
    const validKey = crypto.randomBytes(32);

    test("encrypts plaintext and returns ciphertext, nonce, and tag", () => {
      const plaintext = Buffer.from("secret message");
      const result = aeadEncrypt(validKey, plaintext);

      expect(result).toHaveProperty("ciphertext");
      expect(result).toHaveProperty("nonce");
      expect(result).toHaveProperty("tag");
      expect(Buffer.isBuffer(result.ciphertext)).toBe(true);
      expect(Buffer.isBuffer(result.nonce)).toBe(true);
      expect(Buffer.isBuffer(result.tag)).toBe(true);
    });

    test("generates 12-byte nonce", () => {
      const result = aeadEncrypt(validKey, "test");
      expect(result.nonce.length).toBe(GCM_NONCE_LENGTH);
    });

    test("generates 16-byte auth tag", () => {
      const result = aeadEncrypt(validKey, "test");
      expect(result.tag.length).toBe(GCM_TAG_LENGTH);
    });

    test("ciphertext length equals plaintext length", () => {
      const plaintext = Buffer.from("test message with length");
      const result = aeadEncrypt(validKey, plaintext);
      expect(result.ciphertext.length).toBe(plaintext.length);
    });

    test("generates different nonces each time (randomized)", () => {
      const nonces = new Set();
      for (let i = 0; i < 10; i++) {
        const result = aeadEncrypt(validKey, "test");
        nonces.add(result.nonce.toString("hex"));
      }
      expect(nonces.size).toBe(10);
    });

    test("accepts string plaintext", () => {
      const result = aeadEncrypt(validKey, "string input");
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    test("accepts AAD parameter", () => {
      const result = aeadEncrypt(validKey, "test", "additional data");
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    test("throws on invalid key length", () => {
      const shortKey = crypto.randomBytes(16);

      expect(() => aeadEncrypt(shortKey, "test")).toThrow();
      try {
        aeadEncrypt(shortKey, "test");
      } catch (err) {
        expect(err.code).toBe(CryptoError.INVALID_KEY_LENGTH);
      }
    });

    test("throws on non-Buffer key", () => {
      expect(() => aeadEncrypt("string-key", "test")).toThrow();
    });

    test("handles empty plaintext", () => {
      const result = aeadEncrypt(validKey, "");
      expect(result.ciphertext.length).toBe(0);
    });
  });

  describe("aeadDecrypt()", () => {
    const validKey = crypto.randomBytes(32);

    test("decrypts ciphertext correctly", () => {
      const plaintext = Buffer.from("secret message");
      const encrypted = aeadEncrypt(validKey, plaintext);
      const decrypted = aeadDecrypt(
        validKey,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.tag
      );

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("round-trip with string input", () => {
      const original = "test string content";
      const encrypted = aeadEncrypt(validKey, original);
      const decrypted = aeadDecrypt(
        validKey,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.tag
      );

      expect(decrypted.toString()).toBe(original);
    });

    test("round-trip with AAD", () => {
      const plaintext = Buffer.from("sensitive data");
      const aad = "context-info";
      const encrypted = aeadEncrypt(validKey, plaintext, aad);
      const decrypted = aeadDecrypt(
        validKey,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.tag,
        aad
      );

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("fails with wrong key", () => {
      const encrypted = aeadEncrypt(validKey, "test");
      const wrongKey = crypto.randomBytes(32);

      expect(() =>
        aeadDecrypt(
          wrongKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag
        )
      ).toThrow();
    });

    test("fails with wrong AAD", () => {
      const encrypted = aeadEncrypt(validKey, "test", "correct-aad");

      expect(() =>
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag,
          "wrong-aad"
        )
      ).toThrow();
      try {
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag,
          "wrong-aad"
        );
      } catch (err) {
        expect(err.code).toBe(CryptoError.DECRYPTION_FAILED);
      }
    });

    test("fails with tampered ciphertext", () => {
      const encrypted = aeadEncrypt(validKey, "test message");
      encrypted.ciphertext[0] ^= 0xff; // Flip bits

      expect(() =>
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag
        )
      ).toThrow();
    });

    test("fails with tampered tag", () => {
      const encrypted = aeadEncrypt(validKey, "test");
      encrypted.tag[0] ^= 0xff;

      expect(() =>
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag
        )
      ).toThrow();
    });

    test("throws on invalid key length", () => {
      const encrypted = aeadEncrypt(validKey, "test");
      const shortKey = crypto.randomBytes(16);

      expect(() =>
        aeadDecrypt(
          shortKey,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag
        )
      ).toThrow();
    });

    test("throws on invalid nonce length", () => {
      const encrypted = aeadEncrypt(validKey, "test");

      expect(() =>
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          Buffer.alloc(8), // Wrong length
          encrypted.tag
        )
      ).toThrow();
    });

    test("throws on invalid tag length", () => {
      const encrypted = aeadEncrypt(validKey, "test");

      expect(() =>
        aeadDecrypt(
          validKey,
          encrypted.ciphertext,
          encrypted.nonce,
          Buffer.alloc(8) // Wrong length
        )
      ).toThrow();
    });
  });

  // ============================================================
  // Packing Tests
  // ============================================================

  describe("packEncrypted() / unpackEncrypted()", () => {
    const key = crypto.randomBytes(32);

    test("packEncrypted creates buffer of correct length", () => {
      const encrypted = aeadEncrypt(key, "test message");
      const packed = packEncrypted(encrypted);

      const expectedLength =
        GCM_NONCE_LENGTH + GCM_TAG_LENGTH + encrypted.ciphertext.length;
      expect(packed.length).toBe(expectedLength);
    });

    test("unpackEncrypted reverses packEncrypted", () => {
      const encrypted = aeadEncrypt(key, "test");
      const packed = packEncrypted(encrypted);
      const unpacked = unpackEncrypted(packed);

      expect(unpacked.nonce.equals(encrypted.nonce)).toBe(true);
      expect(unpacked.tag.equals(encrypted.tag)).toBe(true);
      expect(unpacked.ciphertext.equals(encrypted.ciphertext)).toBe(true);
    });

    test("round-trip preserves data integrity", () => {
      const plaintext = Buffer.from("round-trip test data");
      const encrypted = aeadEncrypt(key, plaintext, "aad");
      const packed = packEncrypted(encrypted);
      const unpacked = unpackEncrypted(packed);
      const decrypted = aeadDecrypt(
        key,
        unpacked.ciphertext,
        unpacked.nonce,
        unpacked.tag,
        "aad"
      );

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("packEncrypted throws on invalid input", () => {
      expect(() => packEncrypted({})).toThrow();
      expect(() => packEncrypted({ nonce: Buffer.alloc(12) })).toThrow();
    });

    test("unpackEncrypted throws on too-short buffer", () => {
      const tooShort = Buffer.alloc(10);

      expect(() => unpackEncrypted(tooShort)).toThrow();
      try {
        unpackEncrypted(tooShort);
      } catch (err) {
        expect(err.code).toBe(CryptoError.INVALID_CIPHERTEXT);
      }
    });

    test("unpackEncrypted throws on non-Buffer", () => {
      expect(() => unpackEncrypted("string")).toThrow();
    });

    test("unpackEncrypted handles empty ciphertext", () => {
      // Pack with empty ciphertext
      const encrypted = aeadEncrypt(key, "");
      const packed = packEncrypted(encrypted);
      const unpacked = unpackEncrypted(packed);

      expect(unpacked.ciphertext.length).toBe(0);
    });
  });

  describe("encryptAndPack() / unpackAndDecrypt()", () => {
    const key = crypto.randomBytes(32);

    test("convenience functions work together", () => {
      const plaintext = "convenience test";
      const packed = encryptAndPack(key, plaintext, "context");
      const decrypted = unpackAndDecrypt(key, packed, "context");

      expect(decrypted.toString()).toBe(plaintext);
    });

    test("handles binary data", () => {
      const plaintext = crypto.randomBytes(256);
      const packed = encryptAndPack(key, plaintext);
      const decrypted = unpackAndDecrypt(key, packed);

      expect(decrypted.equals(plaintext)).toBe(true);
    });
  });

  // ============================================================
  // HKDF Tests
  // ============================================================

  describe("hkdf()", () => {
    test("derives 32-byte key by default", () => {
      const derived = hkdf("input-key-material", "salt", "info");
      expect(derived.length).toBe(32);
      expect(Buffer.isBuffer(derived)).toBe(true);
    });

    test("derives key of specified length", () => {
      expect(hkdf("ikm", "salt", "info", 16).length).toBe(16);
      expect(hkdf("ikm", "salt", "info", 64).length).toBe(64);
    });

    test("same inputs produce same output (deterministic)", () => {
      const key1 = hkdf("ikm", "salt", "info", 32);
      const key2 = hkdf("ikm", "salt", "info", 32);
      expect(key1.equals(key2)).toBe(true);
    });

    test("different info produces different keys", () => {
      const key1 = hkdf("ikm", "salt", "info1", 32);
      const key2 = hkdf("ikm", "salt", "info2", 32);
      expect(key1.equals(key2)).toBe(false);
    });

    test("different salt produces different keys", () => {
      const key1 = hkdf("ikm", "salt1", "info", 32);
      const key2 = hkdf("ikm", "salt2", "info", 32);
      expect(key1.equals(key2)).toBe(false);
    });

    test("accepts Buffer inputs", () => {
      const ikm = Buffer.from("input-key-material");
      const salt = Buffer.from("salt-value");
      const info = Buffer.from("context-info");

      const derived = hkdf(ikm, salt, info);
      expect(derived.length).toBe(32);
    });

    test("handles empty salt", () => {
      const derived = hkdf("ikm", "", "info");
      expect(derived.length).toBe(32);
    });
  });

  // ============================================================
  // Argon2id / PBKDF2 Tests
  // ============================================================

  describe("argon2id()", () => {
    const salt = crypto.randomBytes(16);

    test("derives 32-byte key by default", async () => {
      const derived = await argon2id("password", salt);
      expect(derived.length).toBe(32);
      expect(Buffer.isBuffer(derived)).toBe(true);
    });

    test("same inputs produce same output", async () => {
      const key1 = await argon2id("password", salt);
      const key2 = await argon2id("password", salt);
      expect(key1.equals(key2)).toBe(true);
    });

    test("different passwords produce different keys", async () => {
      const key1 = await argon2id("password1", salt);
      const key2 = await argon2id("password2", salt);
      expect(key1.equals(key2)).toBe(false);
    });

    test("different salts produce different keys", async () => {
      const salt2 = crypto.randomBytes(16);
      const key1 = await argon2id("password", salt);
      const key2 = await argon2id("password", salt2);
      expect(key1.equals(key2)).toBe(false);
    });

    test("accepts Buffer password", async () => {
      const passwordBuf = Buffer.from("password");
      const derived = await argon2id(passwordBuf, salt);
      expect(derived.length).toBe(32);
    });

    test("respects custom hash length", async () => {
      const derived = await argon2id("password", salt, { hashLength: 64 });
      expect(derived.length).toBe(64);
    });

    test("throws on salt too short", async () => {
      const shortSalt = Buffer.alloc(8);

      await expect(argon2id("password", shortSalt)).rejects.toThrow();
    });

    test("throws on non-Buffer salt", async () => {
      await expect(argon2id("password", "string-salt")).rejects.toThrow();
    });
  });

  describe("pbkdf2Fallback()", () => {
    const salt = crypto.randomBytes(16);

    test("derives 32-byte key by default", () => {
      const derived = pbkdf2Fallback("password", salt);
      expect(derived.length).toBe(32);
      expect(Buffer.isBuffer(derived)).toBe(true);
    });

    test("same inputs produce same output", () => {
      const key1 = pbkdf2Fallback("password", salt, 10000);
      const key2 = pbkdf2Fallback("password", salt, 10000);
      expect(key1.equals(key2)).toBe(true);
    });

    test("respects custom iterations", () => {
      // Different iterations should produce different results
      const key1 = pbkdf2Fallback("password", salt, 1000);
      const key2 = pbkdf2Fallback("password", salt, 2000);
      expect(key1.equals(key2)).toBe(false);
    });

    test("respects custom key length", () => {
      const derived = pbkdf2Fallback("password", salt, 1000, 64);
      expect(derived.length).toBe(64);
    });

    test("throws on non-Buffer salt", () => {
      expect(() => pbkdf2Fallback("password", "string-salt")).toThrow();
    });
  });

  describe("isArgon2Available()", () => {
    test("returns boolean", () => {
      const result = isArgon2Available();
      expect(typeof result).toBe("boolean");
    });
  });

  // ============================================================
  // Utility Function Tests
  // ============================================================

  describe("generateSalt()", () => {
    test("generates 16-byte salt by default", () => {
      const salt = generateSalt();
      expect(salt.length).toBe(16);
      expect(Buffer.isBuffer(salt)).toBe(true);
    });

    test("generates salt of specified length", () => {
      expect(generateSalt(32).length).toBe(32);
      expect(generateSalt(8).length).toBe(8);
    });

    test("generates different salts each time", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe("generateKey()", () => {
    test("generates 32-byte key by default", () => {
      const key = generateKey();
      expect(key.length).toBe(AES_KEY_LENGTH);
      expect(Buffer.isBuffer(key)).toBe(true);
    });

    test("generates key of specified length", () => {
      expect(generateKey(16).length).toBe(16);
      expect(generateKey(64).length).toBe(64);
    });
  });

  describe("timingSafeEqual()", () => {
    test("returns true for equal buffers", () => {
      const a = Buffer.from("test");
      const b = Buffer.from("test");
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    test("returns false for different buffers", () => {
      const a = Buffer.from("test1");
      const b = Buffer.from("test2");
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    test("returns false for different lengths", () => {
      const a = Buffer.from("short");
      const b = Buffer.from("longer");
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    test("returns false for non-Buffer inputs", () => {
      expect(timingSafeEqual("a", "a")).toBe(false);
      expect(timingSafeEqual(Buffer.from("a"), "a")).toBe(false);
    });
  });

  describe("deriveKeyForPurpose()", () => {
    const masterKey = crypto.randomBytes(32);

    test("derives 32-byte key", () => {
      const derived = deriveKeyForPurpose(masterKey, "S1_key");
      expect(derived.length).toBe(32);
    });

    test("different purposes produce different keys", () => {
      const key1 = deriveKeyForPurpose(masterKey, "S1_key");
      const key2 = deriveKeyForPurpose(masterKey, "S2_key");
      const key3 = deriveKeyForPurpose(masterKey, "S3_key");

      expect(key1.equals(key2)).toBe(false);
      expect(key2.equals(key3)).toBe(false);
      expect(key1.equals(key3)).toBe(false);
    });

    test("different versions produce different keys", () => {
      const key1 = deriveKeyForPurpose(masterKey, "S1_key", 1);
      const key2 = deriveKeyForPurpose(masterKey, "S1_key", 2);

      expect(key1.equals(key2)).toBe(false);
    });

    test("same inputs produce same output (deterministic)", () => {
      const key1 = deriveKeyForPurpose(masterKey, "S1_key", 1);
      const key2 = deriveKeyForPurpose(masterKey, "S1_key", 1);

      expect(key1.equals(key2)).toBe(true);
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe("Integration Tests", () => {
    test("full encryption flow with derived keys", async () => {
      // Derive key from password
      const salt = generateSalt();
      const masterKey = await argon2id("user-password", salt);

      // Derive purpose-specific key
      const encKey = deriveKeyForPurpose(masterKey, "share_encryption");

      // Encrypt data
      const plaintext = Buffer.from("sensitive share data");
      const packed = encryptAndPack(encKey, plaintext, "S1_v1");

      // Decrypt data
      const decrypted = unpackAndDecrypt(encKey, packed, "S1_v1");

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("key derivation for 2-of-3 shares", () => {
      const masterSecret = generateKey();

      // Derive keys for each share
      const s1Key = deriveKeyForPurpose(masterSecret, "S1_oauth");
      const s2Key = deriveKeyForPurpose(masterSecret, "S2_webauthn");
      const s3Key = deriveKeyForPurpose(masterSecret, "S3_totp");

      // All keys should be unique
      expect(s1Key.equals(s2Key)).toBe(false);
      expect(s2Key.equals(s3Key)).toBe(false);
      expect(s1Key.equals(s3Key)).toBe(false);

      // All keys should be 32 bytes
      expect(s1Key.length).toBe(32);
      expect(s2Key.length).toBe(32);
      expect(s3Key.length).toBe(32);
    });

    test("encrypt share with HKDF-derived key from OAuth token", () => {
      const oauthToken = "oauth-access-token-12345";
      const shareData = crypto.randomBytes(32); // SSS share

      // Derive encryption key from OAuth token
      const encKey = hkdf(oauthToken, "api-ape", "S1_encryption_key_v1");

      // Encrypt share
      const packed = encryptAndPack(encKey, shareData, "S1_oauth_v1");

      // Decrypt with same derived key
      const decrypted = unpackAndDecrypt(encKey, packed, "S1_oauth_v1");

      expect(decrypted.equals(shareData)).toBe(true);
    });
  });

  // ============================================================================
  // Real-world defensive validation: aeadEncrypt / aeadDecrypt input
  // sanity checks. Callers may accidentally pass a non-Buffer key when
  // wiring a fresh integration.
  // ============================================================================
  describe("AEAD validation paths", () => {
    test("aeadEncrypt with non-Buffer key throws", () => {
      expect(() => aeadEncrypt("not-a-buffer", "plaintext")).toThrow();
    });

    test("aeadEncrypt with null key surfaces 'invalid' in the message", () => {
      let err;
      try {
        aeadEncrypt(null, "plaintext");
      } catch (e) {
        err = e;
      }
      expect(err.message).toMatch(/invalid/);
    });

    // Scenario: caller passes a Buffer as AAD (not a string). The
    // `Buffer.isBuffer(aad) ? aad : Buffer.from(aad)` LHS engages.
    test("aeadEncrypt + aeadDecrypt with Buffer AAD round-trips", () => {
      const key = Buffer.alloc(32, 7);
      const aad = Buffer.from("buffer-aad");
      const enc = aeadEncrypt(key, "plaintext", aad);
      const decrypted = aeadDecrypt(key, enc.ciphertext, enc.nonce, enc.tag, aad);
      expect(decrypted.toString()).toBe("plaintext");
    });

    // Scenario: aeadDecrypt called with ciphertext that's not a Buffer (e.g.
    // a base64 string slipped through). The defensive check rejects with
    // INVALID_CIPHERTEXT before crypto.createDecipheriv even runs.
    test("aeadDecrypt with non-Buffer ciphertext throws Ciphertext-must-be-a-Buffer", () => {
      const validKey = Buffer.alloc(32, 1);
      const validNonce = Buffer.alloc(12, 2);
      const validTag = Buffer.alloc(16, 3);
      let err;
      try {
        aeadDecrypt(validKey, "not-a-buffer", validNonce, validTag);
      } catch (e) {
        err = e;
      }
      expect(err.message).toMatch(/Ciphertext must be a Buffer/);
    });
  });

  // ============================================================================
  // Standalone hash helpers exposed for downstream consumers (e.g. an
  // integrator who needs SHA-256 or HMAC-SHA256 outside the AEAD flow).
  // ============================================================================
  describe("sha256 / hmacSha256 exported helpers", () => {
    const { sha256, hmacSha256 } = require("./crypto/utils");

    test("sha256 produces a 32-byte digest", () => {
      const d = sha256("hello");
      expect(Buffer.isBuffer(d)).toBe(true);
      expect(d.length).toBe(32);
    });

    test("hmacSha256 produces a 32-byte digest", () => {
      const d = hmacSha256(Buffer.from("key"), "message");
      expect(Buffer.isBuffer(d)).toBe(true);
      expect(d.length).toBe(32);
    });
  });

  // ==========================================================================
  // Real-world scenario: an integrator installs the optional `argon2` package
  // for memory-hard KDF (recommended over the PBKDF2 fallback). The kdf module
  // detects argon2 at load time. We use jest.doMock to simulate argon2 being
  // installed, and exercise the success + fallback-on-throw paths.
  // ==========================================================================
  describe("argon2id when the optional package is installed", () => {
    test("delegates to argon2.hash() and returns the raw Buffer", async () => {
      await new Promise((resolve, reject) => {
        jest.isolateModules(() => {
          jest.doMock("argon2", () => ({
            argon2id: 2,
            hash: jest.fn(async () => Buffer.from("argon-derived-32-byte-output!!")),
          }), { virtual: true });
          const { argon2id } = require("./crypto/kdf");
          argon2id("password", Buffer.alloc(16, 1)).then((derived) => {
            try {
              expect(Buffer.isBuffer(derived)).toBe(true);
              expect(derived.toString()).toBe("argon-derived-32-byte-output!!");
              resolve();
            } catch (e) { reject(e); }
            finally { jest.dontMock("argon2"); }
          }, reject);
        });
      });
    });

    test("falls back to PBKDF2 when argon2.hash throws", async () => {
      await new Promise((resolve, reject) => {
        jest.isolateModules(() => {
          jest.doMock("argon2", () => ({
            argon2id: 2,
            hash: jest.fn(async () => { throw new Error("argon failed"); }),
          }), { virtual: true });
          const { argon2id } = require("./crypto/kdf");
          argon2id("password", Buffer.alloc(16, 1)).then((derived) => {
            try {
              // Fell back to PBKDF2 — returns a non-empty Buffer
              expect(Buffer.isBuffer(derived)).toBe(true);
              expect(derived.length).toBe(32);
              resolve();
            } catch (e) { reject(e); }
            finally { jest.dontMock("argon2"); }
          }, reject);
        });
      });
    });

    test("isArgon2Available reports true when argon2 is installed", () => {
      jest.isolateModules(() => {
        jest.doMock("argon2", () => ({ argon2id: 2, hash: async () => Buffer.alloc(32) }), { virtual: true });
        const { isArgon2Available } = require("./crypto/kdf");
        expect(isArgon2Available()).toBe(true);
        jest.dontMock("argon2");
      });
    });
  });
});
