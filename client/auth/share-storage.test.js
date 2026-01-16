'use strict';

/**
 * Tests for client/auth/share-storage.js
 *
 * These tests use fake-indexeddb to simulate IndexedDB in Node.js
 */

// Mock IndexedDB before requiring the module
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;

const storage = require('./share-storage');

describe('Share Storage', () => {
  beforeEach(async () => {
    // Clear database before each test
    await storage.clearDatabase();
  });

  afterAll(async () => {
    await storage.clearDatabase();
  });

  describe('Database Operations', () => {
    test('openDatabase creates database with correct stores', async () => {
      const db = await storage.openDatabase();

      expect(db.name).toBe(storage.DB_NAME);
      expect(db.version).toBe(storage.DB_VERSION);
      expect(db.objectStoreNames.contains(storage.STORE_SHARES)).toBe(true);
      expect(db.objectStoreNames.contains(storage.STORE_KEYS)).toBe(true);
      expect(db.objectStoreNames.contains(storage.STORE_METADATA)).toBe(true);

      db.close();
    });

    test('clearDatabase removes all data', async () => {
      // Add some data
      await storage.saveShare('user1', 'share1', 'encrypted-data');
      await storage.saveWrappedKey('user1', 'key1', 'wrapped-key');
      await storage.saveMetadata('user1', { enrolledAt: Date.now() });

      // Clear
      await storage.clearDatabase();

      // Verify empty (need to re-open database)
      const share = await storage.getShare('user1', 'share1');
      const key = await storage.getWrappedKey('key1');
      const metadata = await storage.getMetadata('user1');

      expect(share).toBeNull();
      expect(key).toBeNull();
      expect(metadata).toBeNull();
    });
  });

  describe('Share Operations', () => {
    describe('saveShare()', () => {
      test('saves a new share', async () => {
        await storage.saveShare('user1', 'share1', 'encrypted-share-data');

        const result = await storage.getShare('user1', 'share1');
        expect(result).not.toBeNull();
        expect(result.encryptedShare).toBe('encrypted-share-data');
        expect(result.version).toBe(1);
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
      });

      test('saves share with custom version', async () => {
        await storage.saveShare('user1', 'share1', 'data', 5);

        const result = await storage.getShare('user1', 'share1');
        expect(result.version).toBe(5);
      });

      test('saves share from Uint8Array', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await storage.saveShare('user1', 'share1', data);

        const result = await storage.getShare('user1', 'share1');
        expect(result.encryptedShare).toBe(btoa(String.fromCharCode(1, 2, 3, 4, 5)));
      });

      test('updates existing share', async () => {
        await storage.saveShare('user1', 'share1', 'original-data', 1);
        const original = await storage.getShare('user1', 'share1');

        // Wait a bit to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));

        await storage.saveShare('user1', 'share1', 'updated-data', 2);
        const updated = await storage.getShare('user1', 'share1');

        expect(updated.encryptedShare).toBe('updated-data');
        expect(updated.version).toBe(2);
        expect(updated.createdAt).toBe(original.createdAt);
        expect(updated.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
      });

      test('throws on missing userId', async () => {
        await expect(storage.saveShare(null, 'share1', 'data'))
          .rejects.toThrow('userId is required');
        await expect(storage.saveShare('', 'share1', 'data'))
          .rejects.toThrow('userId is required');
      });

      test('throws on missing shareId', async () => {
        await expect(storage.saveShare('user1', null, 'data'))
          .rejects.toThrow('shareId is required');
        await expect(storage.saveShare('user1', '', 'data'))
          .rejects.toThrow('shareId is required');
      });

      test('throws on missing encryptedShare', async () => {
        await expect(storage.saveShare('user1', 'share1', null))
          .rejects.toThrow('encryptedShare is required');
      });
    });

    describe('getShare()', () => {
      test('returns share data', async () => {
        await storage.saveShare('user1', 'share1', 'test-data', 3);

        const result = await storage.getShare('user1', 'share1');
        expect(result).toEqual({
          encryptedShare: 'test-data',
          version: 3,
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
      });

      test('returns null for non-existent share', async () => {
        const result = await storage.getShare('user1', 'nonexistent');
        expect(result).toBeNull();
      });

      test('returns null for different user', async () => {
        await storage.saveShare('user1', 'share1', 'data');

        const result = await storage.getShare('user2', 'share1');
        expect(result).toBeNull();
      });

      test('throws on missing userId', async () => {
        await expect(storage.getShare(null, 'share1'))
          .rejects.toThrow('userId is required');
      });

      test('throws on missing shareId', async () => {
        await expect(storage.getShare('user1', null))
          .rejects.toThrow('shareId is required');
      });
    });

    describe('getAllShares()', () => {
      test('returns all shares for user', async () => {
        await storage.saveShare('user1', 'share1', 'data1');
        await storage.saveShare('user1', 'share2', 'data2');
        await storage.saveShare('user1', 'share3', 'data3');

        const results = await storage.getAllShares('user1');
        expect(results).toHaveLength(3);
        expect(results.map(r => r.shareId).sort()).toEqual(['share1', 'share2', 'share3']);
      });

      test('returns empty array for user with no shares', async () => {
        const results = await storage.getAllShares('user1');
        expect(results).toEqual([]);
      });

      test('only returns shares for specified user', async () => {
        await storage.saveShare('user1', 'share1', 'data1');
        await storage.saveShare('user2', 'share2', 'data2');

        const results = await storage.getAllShares('user1');
        expect(results).toHaveLength(1);
        expect(results[0].shareId).toBe('share1');
      });

      test('throws on missing userId', async () => {
        await expect(storage.getAllShares(null))
          .rejects.toThrow('userId is required');
      });
    });

    describe('deleteShare()', () => {
      test('deletes existing share', async () => {
        await storage.saveShare('user1', 'share1', 'data');

        const deleted = await storage.deleteShare('user1', 'share1');
        expect(deleted).toBe(true);

        const result = await storage.getShare('user1', 'share1');
        expect(result).toBeNull();
      });

      test('returns false for non-existent share', async () => {
        const deleted = await storage.deleteShare('user1', 'nonexistent');
        expect(deleted).toBe(false);
      });

      test('only deletes share for correct user', async () => {
        await storage.saveShare('user1', 'share1', 'data');

        const deleted = await storage.deleteShare('user2', 'share1');
        expect(deleted).toBe(false);

        const result = await storage.getShare('user1', 'share1');
        expect(result).not.toBeNull();
      });

      test('throws on missing userId', async () => {
        await expect(storage.deleteShare(null, 'share1'))
          .rejects.toThrow('userId is required');
      });

      test('throws on missing shareId', async () => {
        await expect(storage.deleteShare('user1', null))
          .rejects.toThrow('shareId is required');
      });
    });

    describe('getShareVersion()', () => {
      test('returns version for existing share', async () => {
        await storage.saveShare('user1', 'share1', 'data', 7);

        const version = await storage.getShareVersion('user1', 'share1');
        expect(version).toBe(7);
      });

      test('returns null for non-existent share', async () => {
        const version = await storage.getShareVersion('user1', 'nonexistent');
        expect(version).toBeNull();
      });
    });
  });

  describe('Key Operations', () => {
    describe('saveWrappedKey()', () => {
      test('saves a new wrapped key', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'wrapped-key-data');

        const result = await storage.getWrappedKey('key1');
        expect(result).not.toBeNull();
        expect(result.wrappedKey).toBe('wrapped-key-data');
        expect(result.userId).toBe('user1');
        expect(result.createdAt).toBeDefined();
      });

      test('saves key from Uint8Array', async () => {
        const data = new Uint8Array([10, 20, 30]);
        await storage.saveWrappedKey('user1', 'key1', data);

        const result = await storage.getWrappedKey('key1');
        expect(result.wrappedKey).toBe(btoa(String.fromCharCode(10, 20, 30)));
      });

      test('updates existing key', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'original');
        await storage.saveWrappedKey('user1', 'key1', 'updated');

        const result = await storage.getWrappedKey('key1');
        expect(result.wrappedKey).toBe('updated');
      });

      test('throws on missing userId', async () => {
        await expect(storage.saveWrappedKey(null, 'key1', 'data'))
          .rejects.toThrow('userId is required');
      });

      test('throws on missing keyId', async () => {
        await expect(storage.saveWrappedKey('user1', null, 'data'))
          .rejects.toThrow('keyId is required');
      });

      test('throws on missing wrappedKey', async () => {
        await expect(storage.saveWrappedKey('user1', 'key1', null))
          .rejects.toThrow('wrappedKey is required');
      });
    });

    describe('getWrappedKey()', () => {
      test('returns key data', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'test-key');

        const result = await storage.getWrappedKey('key1');
        expect(result).toEqual({
          wrappedKey: 'test-key',
          userId: 'user1',
          createdAt: expect.any(Number)
        });
      });

      test('returns null for non-existent key', async () => {
        const result = await storage.getWrappedKey('nonexistent');
        expect(result).toBeNull();
      });

      test('throws on missing keyId', async () => {
        await expect(storage.getWrappedKey(null))
          .rejects.toThrow('keyId is required');
      });
    });

    describe('getAllWrappedKeys()', () => {
      test('returns all keys for user', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'data1');
        await storage.saveWrappedKey('user1', 'key2', 'data2');

        const results = await storage.getAllWrappedKeys('user1');
        expect(results).toHaveLength(2);
        expect(results.map(r => r.keyId).sort()).toEqual(['key1', 'key2']);
      });

      test('returns empty array for user with no keys', async () => {
        const results = await storage.getAllWrappedKeys('user1');
        expect(results).toEqual([]);
      });

      test('only returns keys for specified user', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'data1');
        await storage.saveWrappedKey('user2', 'key2', 'data2');

        const results = await storage.getAllWrappedKeys('user1');
        expect(results).toHaveLength(1);
        expect(results[0].keyId).toBe('key1');
      });

      test('throws on missing userId', async () => {
        await expect(storage.getAllWrappedKeys(null))
          .rejects.toThrow('userId is required');
      });
    });

    describe('deleteWrappedKey()', () => {
      test('deletes existing key', async () => {
        await storage.saveWrappedKey('user1', 'key1', 'data');

        const deleted = await storage.deleteWrappedKey('key1');
        expect(deleted).toBe(true);

        const result = await storage.getWrappedKey('key1');
        expect(result).toBeNull();
      });

      test('returns false for non-existent key', async () => {
        const deleted = await storage.deleteWrappedKey('nonexistent');
        expect(deleted).toBe(false);
      });

      test('throws on missing keyId', async () => {
        await expect(storage.deleteWrappedKey(null))
          .rejects.toThrow('keyId is required');
      });
    });
  });

  describe('Metadata Operations', () => {
    describe('saveMetadata()', () => {
      test('saves metadata with defaults', async () => {
        await storage.saveMetadata('user1', {});

        const result = await storage.getMetadata('user1');
        expect(result.userId).toBe('user1');
        expect(result.enrolledAt).toBeDefined();
        expect(result.lastRecoveryAt).toBeNull();
        expect(result.shareCount).toBe(0);
        expect(result.updatedAt).toBeDefined();
      });

      test('saves metadata with custom values', async () => {
        const now = Date.now();
        await storage.saveMetadata('user1', {
          enrolledAt: now,
          lastRecoveryAt: now,
          shareCount: 3,
          customField: 'custom'
        });

        const result = await storage.getMetadata('user1');
        expect(result.enrolledAt).toBe(now);
        expect(result.lastRecoveryAt).toBe(now);
        expect(result.shareCount).toBe(3);
        expect(result.customField).toBe('custom');
      });

      test('updates existing metadata', async () => {
        await storage.saveMetadata('user1', { shareCount: 1 });
        await storage.saveMetadata('user1', { shareCount: 2 });

        const result = await storage.getMetadata('user1');
        expect(result.shareCount).toBe(2);
      });

      test('throws on missing userId', async () => {
        await expect(storage.saveMetadata(null, {}))
          .rejects.toThrow('userId is required');
      });
    });

    describe('getMetadata()', () => {
      test('returns metadata', async () => {
        await storage.saveMetadata('user1', { shareCount: 5 });

        const result = await storage.getMetadata('user1');
        expect(result.userId).toBe('user1');
        expect(result.shareCount).toBe(5);
      });

      test('returns null for non-existent user', async () => {
        const result = await storage.getMetadata('nonexistent');
        expect(result).toBeNull();
      });

      test('throws on missing userId', async () => {
        await expect(storage.getMetadata(null))
          .rejects.toThrow('userId is required');
      });
    });
  });

  describe('User Operations', () => {
    describe('deleteAllUserData()', () => {
      test('deletes all data for user', async () => {
        // Create data for user1
        await storage.saveShare('user1', 'share1', 'data1');
        await storage.saveShare('user1', 'share2', 'data2');
        await storage.saveWrappedKey('user1', 'key1', 'key1');
        await storage.saveMetadata('user1', { shareCount: 2 });

        // Create data for user2
        await storage.saveShare('user2', 'share3', 'data3');
        await storage.saveWrappedKey('user2', 'key2', 'key2');

        // Delete user1 data
        const result = await storage.deleteAllUserData('user1');

        expect(result.shares).toBe(2);
        expect(result.keys).toBe(1);

        // Verify user1 data gone
        expect(await storage.getShare('user1', 'share1')).toBeNull();
        expect(await storage.getShare('user1', 'share2')).toBeNull();
        expect(await storage.getAllWrappedKeys('user1')).toEqual([]);
        expect(await storage.getMetadata('user1')).toBeNull();

        // Verify user2 data still exists
        expect(await storage.getShare('user2', 'share3')).not.toBeNull();
        expect(await storage.getAllWrappedKeys('user2')).toHaveLength(1);
      });

      test('throws on missing userId', async () => {
        await expect(storage.deleteAllUserData(null))
          .rejects.toThrow('userId is required');
      });
    });

    describe('isEnrolled()', () => {
      test('returns true for enrolled user', async () => {
        await storage.saveMetadata('user1', { enrolledAt: Date.now() });

        const enrolled = await storage.isEnrolled('user1');
        expect(enrolled).toBe(true);
      });

      test('returns false for non-enrolled user', async () => {
        const enrolled = await storage.isEnrolled('user1');
        expect(enrolled).toBe(false);
      });
    });
  });

  describe('createUserStorage()', () => {
    test('creates storage bound to userId', async () => {
      const userStorage = storage.createUserStorage('user1');

      expect(userStorage.userId).toBe('user1');
      expect(typeof userStorage.saveShare).toBe('function');
      expect(typeof userStorage.getShare).toBe('function');
      expect(typeof userStorage.getAllShares).toBe('function');
      expect(typeof userStorage.deleteShare).toBe('function');
      expect(typeof userStorage.getShareVersion).toBe('function');
      expect(typeof userStorage.saveWrappedKey).toBe('function');
      expect(typeof userStorage.getAllWrappedKeys).toBe('function');
      expect(typeof userStorage.saveMetadata).toBe('function');
      expect(typeof userStorage.getMetadata).toBe('function');
      expect(typeof userStorage.isEnrolled).toBe('function');
      expect(typeof userStorage.deleteAll).toBe('function');
    });

    test('operations work with bound userId', async () => {
      const userStorage = storage.createUserStorage('user1');

      // Save share without specifying userId
      await userStorage.saveShare('share1', 'test-data');

      const share = await userStorage.getShare('share1');
      expect(share.encryptedShare).toBe('test-data');

      const allShares = await userStorage.getAllShares();
      expect(allShares).toHaveLength(1);

      await userStorage.deleteShare('share1');
      expect(await userStorage.getShare('share1')).toBeNull();
    });

    test('metadata operations work with bound userId', async () => {
      const userStorage = storage.createUserStorage('user1');

      expect(await userStorage.isEnrolled()).toBe(false);

      await userStorage.saveMetadata({ shareCount: 3 });

      expect(await userStorage.isEnrolled()).toBe(true);

      const metadata = await userStorage.getMetadata();
      expect(metadata.shareCount).toBe(3);
    });

    test('deleteAll removes all user data', async () => {
      const userStorage = storage.createUserStorage('user1');

      await userStorage.saveShare('share1', 'data');
      await userStorage.saveWrappedKey('key1', 'key');
      await userStorage.saveMetadata({});

      await userStorage.deleteAll();

      expect(await userStorage.getAllShares()).toEqual([]);
      expect(await userStorage.getMetadata()).toBeNull();
    });

    test('throws on missing userId', () => {
      expect(() => storage.createUserStorage(null))
        .toThrow('userId is required');
      expect(() => storage.createUserStorage(''))
        .toThrow('userId is required');
    });
  });

  describe('Edge Cases', () => {
    test('handles special characters in userId', async () => {
      const userId = 'user@example.com';
      await storage.saveShare(userId, 'share1', 'data');

      const result = await storage.getShare(userId, 'share1');
      expect(result.encryptedShare).toBe('data');
    });

    test('handles special characters in shareId', async () => {
      const shareId = 'share-with-dashes_and_underscores.and.dots';
      await storage.saveShare('user1', shareId, 'data');

      const result = await storage.getShare('user1', shareId);
      expect(result.encryptedShare).toBe('data');
    });

    test('handles large share data', async () => {
      const largeData = 'x'.repeat(100000);
      await storage.saveShare('user1', 'share1', largeData);

      const result = await storage.getShare('user1', 'share1');
      expect(result.encryptedShare).toBe(largeData);
    });

    test('handles concurrent operations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(storage.saveShare('user1', `share${i}`, `data${i}`));
      }
      await Promise.all(promises);

      const results = await storage.getAllShares('user1');
      expect(results).toHaveLength(10);
    });
  });
});
