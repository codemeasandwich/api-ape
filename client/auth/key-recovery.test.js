'use strict';

/**
 * Tests for client/auth/key-recovery.js
 *
 * Uses fake-indexeddb and Web Crypto API polyfills for Node.js testing
 */

// Mock IndexedDB
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;

// Mock Web Crypto API — Node 19+ exposes read-only global.crypto; replace or patch safely.
const nodeCrypto = require('crypto');
const mockCrypto = {
  getRandomValues(arr) {
    const bytes = nodeCrypto.randomBytes(arr.length);
    arr.set(bytes);
    return arr;
  },
  subtle: nodeCrypto.webcrypto.subtle,
};
try {
  Object.defineProperty(globalThis, 'crypto', {
    value: mockCrypto,
    writable: true,
    configurable: true,
  });
} catch {
  try {
    globalThis.crypto = mockCrypto;
  } catch {
    globalThis.crypto.getRandomValues = mockCrypto.getRandomValues;
    if (!globalThis.crypto.subtle) {
      globalThis.crypto.subtle = mockCrypto.subtle;
    }
  }
}
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const shareStorage = require('./share-storage');
const {
  KeyRecoveryClient,
  KeyRecoveryError,
  FactorType,
  combineShares,
  deserializeShare,
  serializeShare,
  deriveS1Key,
  deriveS2Key,
  deriveS3Key,
  _gfMul,
  _gfDiv,
  _gfAdd,
  _lagrangeInterpolate,
} = require('./key-recovery');

describe('Key Recovery Client SDK', () => {
  beforeEach(async () => {
    await shareStorage.clearDatabase();
  });

  afterAll(async () => {
    await shareStorage.clearDatabase();
  });

  describe('GF(256) Arithmetic', () => {
    test('gfAdd performs XOR', () => {
      expect(_gfAdd(0, 0)).toBe(0);
      expect(_gfAdd(0x53, 0xca)).toBe(0x99);
      expect(_gfAdd(0xff, 0xff)).toBe(0);
    });

    test('gfMul handles zero', () => {
      expect(_gfMul(0, 0x53)).toBe(0);
      expect(_gfMul(0x53, 0)).toBe(0);
    });

    test('gfMul identity', () => {
      expect(_gfMul(1, 0x53)).toBe(0x53);
      expect(_gfMul(0x53, 1)).toBe(0x53);
    });

    test('gfDiv handles zero numerator', () => {
      expect(_gfDiv(0, 0x53)).toBe(0);
    });

    test('gfDiv throws on zero divisor', () => {
      expect(() => _gfDiv(0x53, 0)).toThrow('Division by zero');
    });

    test('gfMul and gfDiv are inverses', () => {
      const a = 0x53;
      const b = 0xca;
      const product = _gfMul(a, b);
      expect(_gfDiv(product, b)).toBe(a);
    });
  });

  describe('Lagrange Interpolation', () => {
    test('interpolates simple points', () => {
      // For polynomial f(x) = secret (constant), all y values are the same
      const secret = 42;
      const points = [
        { x: 1, y: secret },
        { x: 2, y: secret }
      ];
      expect(_lagrangeInterpolate(points)).toBe(secret);
    });

    test('interpolates linear polynomial', () => {
      // f(x) = 10 + 5x in GF(256)
      // f(0) = 10
      // f(1) = 10 ^ 5 = 15 (XOR in GF(256) for addition)
      // f(2) = 10 ^ gfMul(5, 2) = 10 ^ 10 = 0
      const points = [
        { x: 1, y: 15 },
        { x: 2, y: 0 }
      ];
      expect(_lagrangeInterpolate(points)).toBe(10);
    });
  });

  describe('Share Serialization', () => {
    test('serializeShare packs index and data', () => {
      const share = {
        index: 1,
        data: new Uint8Array([0x41, 0x42, 0x43])
      };
      const serialized = serializeShare(share);
      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);
    });

    test('deserializeShare unpacks correctly', () => {
      const original = {
        index: 2,
        data: new Uint8Array([0x10, 0x20, 0x30])
      };
      const serialized = serializeShare(original);
      const deserialized = deserializeShare(serialized);

      expect(deserialized.index).toBe(original.index);
      expect(deserialized.data).toEqual(original.data);
    });

    test('deserializeShare handles invalid input', () => {
      expect(() => deserializeShare(null)).toThrow();
      expect(() => deserializeShare('')).toThrow();
    });

    test('round-trip serialization preserves data', () => {
      const shares = [
        { index: 1, data: new Uint8Array(32).fill(0xaa) },
        { index: 255, data: new Uint8Array(1).fill(0xff) },
      ];

      for (const original of shares) {
        const serialized = serializeShare(original);
        const restored = deserializeShare(serialized);
        expect(restored.index).toBe(original.index);
        expect(restored.data).toEqual(original.data);
      }
    });
  });

  describe('combineShares', () => {
    test('requires at least 2 shares', () => {
      expect(() => combineShares([])).toThrow();
      expect(() => combineShares([{ index: 1, data: new Uint8Array([1]) }])).toThrow();
    });

    test('combines shares correctly', () => {
      // Create a known secret and manually create shares for f(x) = secret (threshold=2)
      const secret = new Uint8Array([42]);

      // For threshold 2: f(x) = secret + a1*x where a1 is random
      // We'll use a1 = 5 for testing
      // f(1) = 42 ^ 5 = 47
      // f(2) = 42 ^ gfMul(5, 2) = 42 ^ 10 = 32
      const shares = [
        { index: 1, data: new Uint8Array([47]) },
        { index: 2, data: new Uint8Array([32]) }
      ];

      const reconstructed = combineShares(shares);
      expect(reconstructed[0]).toBe(42);
    });

    test('combines multi-byte secret', () => {
      // Using the actual split/combine logic
      const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
      const secret = new Uint8Array([1, 2, 3, 4, 5]);
      const shares = client._splitSecret(secret, 2, 3);

      // Try all combinations
      const combo1 = combineShares([shares[0], shares[1]]);
      const combo2 = combineShares([shares[0], shares[2]]);
      const combo3 = combineShares([shares[1], shares[2]]);

      expect(combo1).toEqual(secret);
      expect(combo2).toEqual(secret);
      expect(combo3).toEqual(secret);
    });
  });

  describe('Key Derivation', () => {
    test('deriveS1Key produces 32-byte key', async () => {
      const key = await deriveS1Key('oauth-token-123', 'user-123');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('deriveS1Key is deterministic', async () => {
      const key1 = await deriveS1Key('token', 'user');
      const key2 = await deriveS1Key('token', 'user');
      expect(key1).toEqual(key2);
    });

    test('deriveS1Key differs with different inputs', async () => {
      const key1 = await deriveS1Key('token1', 'user');
      const key2 = await deriveS1Key('token2', 'user');
      expect(key1).not.toEqual(key2);
    });

    test('deriveS2Key produces 32-byte key', async () => {
      const authData = new Uint8Array(32).fill(0x42);
      const key = await deriveS2Key(authData, 'credential-id');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('deriveS3Key produces 32-byte key', async () => {
      const salt = new Uint8Array(16).fill(0x01);
      const key = await deriveS3Key('totp-seed-base32', salt);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });
  });

  describe('KeyRecoveryClient', () => {
    const createMockSendMessage = (responses = {}) => {
      return async (msg) => {
        if (responses[msg.type]) {
          return responses[msg.type](msg);
        }
        return { type: 'ok' };
      };
    };

    describe('constructor', () => {
      test('requires sendMessage function', () => {
        expect(() => new KeyRecoveryClient()).toThrow('sendMessage function is required');
        expect(() => new KeyRecoveryClient({})).toThrow('sendMessage function is required');
      });

      test('accepts sendMessage function', () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        expect(client).toBeInstanceOf(KeyRecoveryClient);
      });
    });

    describe('isEnrolled', () => {
      test('returns false for non-enrolled user', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const enrolled = await client.isEnrolled('user-123');
        expect(enrolled).toBe(false);
      });

      test('returns true for enrolled user', async () => {
        // Manually create enrollment data
        await shareStorage.saveMetadata('user-123', { enrolledAt: Date.now() });

        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const enrolled = await client.isEnrolled('user-123');
        expect(enrolled).toBe(true);
      });
    });

    describe('enroll', () => {
      test('creates shares and stores locally', async () => {
        const mockSend = createMockSendMessage({
          key_recovery_enrollment_finish: () => ({ type: 'key_recovery_enrollment_ok' })
        });

        const client = new KeyRecoveryClient({ sendMessage: mockSend });

        const result = await client.enroll({
          userId: 'user-enroll-test',
          oauthToken: 'oauth-token',
          totpSeed: 'totp-seed',
          webauthnAuthData: new Uint8Array(32).fill(0x42),
          webauthnCredentialId: 'cred-123'
        });

        expect(result.kUser).toBeInstanceOf(Uint8Array);
        expect(result.kUser.length).toBe(32);
        expect(typeof result.proof).toBe('string');

        // Verify local storage
        const enrolled = await shareStorage.isEnrolled('user-enroll-test');
        expect(enrolled).toBe(true);

        const share = await shareStorage.getShare('user-enroll-test', 'S2');
        expect(share).not.toBeNull();
      });

      test('throws if already enrolled', async () => {
        await shareStorage.saveMetadata('user-already', { enrolledAt: Date.now() });

        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });

        await expect(client.enroll({
          userId: 'user-already',
          oauthToken: 'token',
          totpSeed: 'seed',
          webauthnAuthData: new Uint8Array(32),
          webauthnCredentialId: 'cred'
        })).rejects.toThrow('User already enrolled');
      });

      test('requires all parameters', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });

        await expect(client.enroll({})).rejects.toThrow('userId is required');
        await expect(client.enroll({ userId: 'u' })).rejects.toThrow('oauthToken is required');
        await expect(client.enroll({ userId: 'u', oauthToken: 't' }))
          .rejects.toThrow('totpSeed is required');
      });

      test('rolls back on server error', async () => {
        const mockSend = createMockSendMessage({
          key_recovery_enrollment_finish: () => ({ type: 'error', message: 'Server error' })
        });

        const client = new KeyRecoveryClient({ sendMessage: mockSend });

        await expect(client.enroll({
          userId: 'user-rollback',
          oauthToken: 'token',
          totpSeed: 'seed',
          webauthnAuthData: new Uint8Array(32),
          webauthnCredentialId: 'cred'
        })).rejects.toThrow('Server error');

        // Verify local storage was cleaned up
        const enrolled = await shareStorage.isEnrolled('user-rollback');
        expect(enrolled).toBe(false);
      });
    });

    describe('recover', () => {
      const setupEnrolledUser = async (userId = 'user-recover') => {
        const mockSend = createMockSendMessage({
          key_recovery_enrollment_finish: () => ({ type: 'key_recovery_enrollment_ok' })
        });
        const client = new KeyRecoveryClient({ sendMessage: mockSend });

        const oauthToken = 'oauth-token-123';
        const totpSeed = 'totp-seed-456';
        const webauthnAuthData = new Uint8Array(32).fill(0x42);
        const webauthnCredentialId = 'cred-789';

        const { kUser } = await client.enroll({
          userId,
          oauthToken,
          totpSeed,
          webauthnAuthData,
          webauthnCredentialId
        });

        return {
          userId,
          kUser,
          oauthToken,
          totpSeed,
          webauthnAuthData,
          webauthnCredentialId
        };
      };

      test('throws for non-enrolled user', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });

        await expect(client.recover({
          userId: 'nonexistent',
          factors: [FactorType.OAUTH, FactorType.TOTP]
        })).rejects.toThrow('User not enrolled');
      });

      test('requires exactly 2 factors', async () => {
        await shareStorage.saveMetadata('user-factors', { enrolledAt: Date.now() });

        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });

        await expect(client.recover({
          userId: 'user-factors',
          factors: [FactorType.OAUTH]
        })).rejects.toThrow('Exactly 2 factors required');

        await expect(client.recover({
          userId: 'user-factors',
          factors: [FactorType.OAUTH, FactorType.TOTP, FactorType.WEBAUTHN]
        })).rejects.toThrow('Exactly 2 factors required');
      });

      test('recovers K_user with OAuth + WebAuthn', async () => {
        const userId = 'user-oauth-webauthn-direct';
        const oauthToken = 'oauth-token-recover';
        const totpSeed = 'totp-seed-recover';
        const webauthnAuthData = new Uint8Array(32).fill(0x55);
        const webauthnCredentialId = 'cred-recover';

        // Mock server to store and return S1
        let storedS1;
        const mockSend = async (msg) => {
          switch (msg.type) {
            case 'key_recovery_enrollment_finish':
              storedS1 = msg.encShares.S1;
              return { type: 'key_recovery_enrollment_ok' };
            case 'key_recovery_start':
              return {
                type: 'key_recovery_shares',
                encShares: {
                  S1: storedS1,
                  S1_index: 1
                }
              };
            case 'key_recovery_complete':
              return { type: 'key_recovery_ok', tier: 3 };
            default:
              return { type: 'ok' };
          }
        };

        const client = new KeyRecoveryClient({ sendMessage: mockSend });

        // Enroll
        const { kUser } = await client.enroll({
          userId,
          oauthToken,
          totpSeed,
          webauthnAuthData,
          webauthnCredentialId
        });

        // Now recover
        const recovered = await client.recover({
          userId,
          factors: [FactorType.OAUTH, FactorType.WEBAUTHN],
          factorData: {
            oauthToken,
            webauthnAuthData,
            webauthnCredentialId
          }
        });

        expect(recovered).toEqual(kUser);
      });

      test('throws on invalid factor', async () => {
        // First enroll so we have valid S2 share locally
        const userId = 'user-invalid-factor';
        const oauthToken = 'oauth-invalid';
        const totpSeed = 'totp-invalid';
        const webauthnAuthData = new Uint8Array(32).fill(0x11);
        const webauthnCredentialId = 'cred-invalid';

        let storedS1;
        const mockSend = async (msg) => {
          switch (msg.type) {
            case 'key_recovery_enrollment_finish':
              storedS1 = msg.encShares.S1;
              return { type: 'key_recovery_enrollment_ok' };
            case 'key_recovery_start':
              return {
                type: 'key_recovery_shares',
                encShares: {
                  S1: storedS1,
                  S1_index: 1
                }
              };
            default:
              return { type: 'ok' };
          }
        };

        const client = new KeyRecoveryClient({ sendMessage: mockSend });

        await client.enroll({
          userId,
          oauthToken,
          totpSeed,
          webauthnAuthData,
          webauthnCredentialId
        });

        await expect(client.recover({
          userId,
          factors: [FactorType.OAUTH, 'invalid_factor'],
          factorData: { oauthToken }
        })).rejects.toThrow('Unknown factor');
      });
    });

    describe('unenroll', () => {
      test('clears local storage', async () => {
        // Setup enrolled user
        await shareStorage.saveShare('user-unenroll', 'S2', 'encrypted-data');
        await shareStorage.saveMetadata('user-unenroll', { enrolledAt: Date.now() });

        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        await client.unenroll('user-unenroll');

        const enrolled = await shareStorage.isEnrolled('user-unenroll');
        expect(enrolled).toBe(false);
      });
    });

    describe('_splitSecret', () => {
      test('splits secret into correct number of shares', () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const secret = new Uint8Array([1, 2, 3, 4]);

        const shares = client._splitSecret(secret, 2, 3);

        expect(shares).toHaveLength(3);
        expect(shares[0].index).toBe(1);
        expect(shares[1].index).toBe(2);
        expect(shares[2].index).toBe(3);
        expect(shares[0].data.length).toBe(4);
      });

      test('any 2 shares reconstruct the secret', () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const secret = new Uint8Array(32);
        global.crypto.getRandomValues(secret);

        const shares = client._splitSecret(secret, 2, 3);

        // Test all 2-combinations
        expect(combineShares([shares[0], shares[1]])).toEqual(secret);
        expect(combineShares([shares[0], shares[2]])).toEqual(secret);
        expect(combineShares([shares[1], shares[2]])).toEqual(secret);
      });

      test('single share reveals nothing', () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const secret = new Uint8Array([42, 42, 42, 42]);

        const shares = client._splitSecret(secret, 2, 3);

        // Each share should be different from secret
        expect(shares[0].data).not.toEqual(secret);
        expect(shares[1].data).not.toEqual(secret);
        expect(shares[2].data).not.toEqual(secret);
      });
    });

    describe('_generateProof', () => {
      test('generates consistent proof', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const kUser = new Uint8Array(32).fill(0x42);

        const proof1 = await client._generateProof(kUser, 'user-123');
        const proof2 = await client._generateProof(kUser, 'user-123');

        expect(proof1).toBe(proof2);
      });

      test('different keys produce different proofs', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const kUser1 = new Uint8Array(32).fill(0x42);
        const kUser2 = new Uint8Array(32).fill(0x43);

        const proof1 = await client._generateProof(kUser1, 'user-123');
        const proof2 = await client._generateProof(kUser2, 'user-123');

        expect(proof1).not.toBe(proof2);
      });

      test('different users produce different proofs', async () => {
        const client = new KeyRecoveryClient({ sendMessage: async () => ({}) });
        const kUser = new Uint8Array(32).fill(0x42);

        const proof1 = await client._generateProof(kUser, 'user-1');
        const proof2 = await client._generateProof(kUser, 'user-2');

        expect(proof1).not.toBe(proof2);
      });
    });
  });

  describe('FactorType', () => {
    test('has expected values', () => {
      expect(FactorType.OAUTH).toBe('oauth');
      expect(FactorType.WEBAUTHN).toBe('webauthn');
      expect(FactorType.TOTP).toBe('totp');
    });
  });

  describe('KeyRecoveryError', () => {
    test('has expected error codes', () => {
      expect(KeyRecoveryError.NOT_ENROLLED).toBe('NOT_ENROLLED');
      expect(KeyRecoveryError.ALREADY_ENROLLED).toBe('ALREADY_ENROLLED');
      expect(KeyRecoveryError.INSUFFICIENT_FACTORS).toBe('INSUFFICIENT_FACTORS');
      expect(KeyRecoveryError.DECRYPTION_FAILED).toBe('DECRYPTION_FAILED');
    });
  });

  describe('Integration: Full Enrollment and Recovery Flow', () => {
    test('complete flow with all factor combinations', async () => {
      const userId = 'integration-test-user';
      const oauthToken = 'oauth-integration-token';
      const totpSeed = 'totp-integration-seed';
      const webauthnAuthData = new Uint8Array(32);
      global.crypto.getRandomValues(webauthnAuthData);
      const webauthnCredentialId = 'webauthn-integration-cred';

      // Store server-side shares during enrollment
      let serverShares = {};
      let s3Salt;

      const mockSend = async (msg) => {
        switch (msg.type) {
          case 'key_recovery_enrollment_finish':
            serverShares = msg.encShares;
            s3Salt = msg.encShares.S3_salt;
            return { type: 'key_recovery_enrollment_ok' };

          case 'key_recovery_start':
            return {
              type: 'key_recovery_shares',
              encShares: {
                S1: serverShares.S1,
                S1_index: 1,
                S3: serverShares.S3,
                S3_index: 3,
                S3_salt: s3Salt
              }
            };

          case 'key_recovery_complete':
            return { type: 'key_recovery_ok', tier: 3 };

          default:
            return { type: 'ok' };
        }
      };

      const client = new KeyRecoveryClient({ sendMessage: mockSend });

      // 1. Enroll
      const { kUser } = await client.enroll({
        userId,
        oauthToken,
        totpSeed,
        webauthnAuthData,
        webauthnCredentialId
      });

      expect(kUser).toBeInstanceOf(Uint8Array);
      expect(kUser.length).toBe(32);

      // 2. Verify enrollment
      expect(await client.isEnrolled(userId)).toBe(true);

      // 3. Recover with OAuth + WebAuthn
      const recovered1 = await client.recover({
        userId,
        factors: [FactorType.OAUTH, FactorType.WEBAUTHN],
        factorData: {
          oauthToken,
          webauthnAuthData,
          webauthnCredentialId
        }
      });
      expect(recovered1).toEqual(kUser);

      // 4. Recover with OAuth + TOTP
      const recovered2 = await client.recover({
        userId,
        factors: [FactorType.OAUTH, FactorType.TOTP],
        factorData: {
          oauthToken,
          totpSeed
        }
      });
      expect(recovered2).toEqual(kUser);

      // 5. Recover with WebAuthn + TOTP
      const recovered3 = await client.recover({
        userId,
        factors: [FactorType.WEBAUTHN, FactorType.TOTP],
        factorData: {
          webauthnAuthData,
          webauthnCredentialId,
          totpSeed
        }
      });
      expect(recovered3).toEqual(kUser);

      // 6. Unenroll
      await client.unenroll(userId);
      expect(await client.isEnrolled(userId)).toBe(false);
    });
  });
});
