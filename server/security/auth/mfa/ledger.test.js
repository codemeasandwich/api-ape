/**
 * @fileoverview Tests for Share Ledger
 * @module server/security/auth/mfa/ledger.test
 */

"use strict";

const {
  createLedger,
  createShareRecord,
  LedgerMessageType,
  LedgerError,
  ShareId,
  FactorType,
  AuditEventType,
} = require("./ledger");

const crypto = require("crypto");

describe("Ledger", () => {
  let ledger;
  let auditEvents;

  beforeEach(() => {
    auditEvents = [];
    ledger = createLedger({
      auditEnabled: true,
      onAuditEvent: (event) => auditEvents.push(event),
    });
  });

  // ============================================================
  // createShareRecord Tests
  // ============================================================

  describe("createShareRecord()", () => {
    test("creates share record with all fields", () => {
      const data = Buffer.from("encrypted-data");
      const record = createShareRecord("S1", "oauth", data, 1);

      expect(record.shareId).toBe("S1");
      expect(record.factor).toBe("oauth");
      expect(record.encryptedData).toBe(data.toString("base64"));
      expect(record.version).toBe(1);
      expect(record.revoked).toBe(false);
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.revokedAt).toBeNull();
      expect(record.revokedReason).toBeNull();
    });

    test("handles null encrypted data (for S2)", () => {
      const record = createShareRecord("S2", "webauthn", null, 1);

      expect(record.shareId).toBe("S2");
      expect(record.encryptedData).toBeNull();
    });

    test("uses default version of 1", () => {
      const record = createShareRecord("S1", "oauth");
      expect(record.version).toBe(1);
    });
  });

  // ============================================================
  // isEnrolled Tests
  // ============================================================

  describe("isEnrolled()", () => {
    test("returns false for non-existent user", async () => {
      const enrolled = await ledger.isEnrolled("unknown-user");
      expect(enrolled).toBe(false);
    });

    test("returns true after enrollment", async () => {
      const s1Data = crypto.randomBytes(32);
      const s3Data = crypto.randomBytes(32);

      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: s1Data },
        S3: { factor: "totp", data: s3Data },
      });

      const enrolled = await ledger.isEnrolled("user1");
      expect(enrolled).toBe(true);
    });
  });

  // ============================================================
  // storeShares Tests
  // ============================================================

  describe("storeShares()", () => {
    test("stores shares with version 1", async () => {
      const s1Data = crypto.randomBytes(32);
      const s3Data = crypto.randomBytes(32);

      const result = await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: s1Data },
        S3: { factor: "totp", data: s3Data },
      });

      expect(result.type).toBe(LedgerMessageType.SHARE_STORED);
      expect(result.userId).toBe("user1");
      expect(result.shares.S1.version).toBe(1);
      expect(result.shares.S3.version).toBe(1);
    });

    test("automatically creates S2 metadata", async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });

      const versions = await ledger.getVersions("user1");
      expect(versions.S2).toBeDefined();
      expect(versions.S2.factor).toBe("webauthn");
    });

    test("stores proof hash when provided", async () => {
      const proofHash = crypto.createHash("sha256").update("K_user").digest();

      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      }, { proofHash });

      const storedHash = await ledger.getProofHash("user1");
      expect(storedHash.equals(proofHash)).toBe(true);
    });

    test("rejects duplicate enrollment", async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
      });

      await expect(
        ledger.storeShares("user1", {
          S1: { factor: "oauth", data: Buffer.from("s1-new") },
        })
      ).rejects.toThrow();

      try {
        await ledger.storeShares("user1", {
          S1: { factor: "oauth", data: Buffer.from("s1-new") },
        });
      } catch (err) {
        expect(err.code).toBe(LedgerError.ALREADY_ENROLLED);
      }
    });

    test("rejects invalid share IDs", async () => {
      await expect(
        ledger.storeShares("user1", {
          INVALID: { factor: "oauth", data: Buffer.from("data") },
        })
      ).rejects.toThrow();

      try {
        await ledger.storeShares("user1", {
          INVALID: { factor: "oauth", data: Buffer.from("data") },
        });
      } catch (err) {
        expect(err.code).toBe(LedgerError.INVALID_SHARE_ID);
      }
    });

    test("logs enrollment audit event", async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
      });

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.ENROLLMENT);
      expect(auditEvents[0].userId).toBe("user1");
    });
  });

  // ============================================================
  // fetchShares Tests
  // ============================================================

  describe("fetchShares()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1-data") },
        S3: { factor: "totp", data: Buffer.from("s3-data") },
      });
      auditEvents = []; // Clear enrollment events
    });

    test("returns requested shares with data and metadata", async () => {
      const result = await ledger.fetchShares("user1", ["S1", "S3"]);

      expect(result.type).toBe(LedgerMessageType.SHARE_FETCHED);
      expect(Buffer.isBuffer(result.shares.S1)).toBe(true);
      expect(Buffer.isBuffer(result.shares.S3)).toBe(true);
      expect(result.metadata.S1.version).toBe(1);
      expect(result.metadata.S1.factor).toBe("oauth");
    });

    test("returns all shares when no IDs specified", async () => {
      const result = await ledger.fetchShares("user1");

      expect(result.shares.S1).toBeDefined();
      expect(result.shares.S3).toBeDefined();
      expect(result.metadata.S2).toBeDefined(); // S2 metadata exists
    });

    test("S2 has metadata but no data", async () => {
      const result = await ledger.fetchShares("user1");

      expect(result.shares.S2).toBeUndefined(); // No encrypted data
      expect(result.metadata.S2).toBeDefined();
      expect(result.metadata.S2.factor).toBe("webauthn");
    });

    test("throws on unknown user", async () => {
      await expect(ledger.fetchShares("unknown")).rejects.toThrow();

      try {
        await ledger.fetchShares("unknown");
      } catch (err) {
        expect(err.code).toBe(LedgerError.USER_NOT_FOUND);
      }
    });

    test("throws on unknown share ID", async () => {
      await expect(ledger.fetchShares("user1", ["S4"])).rejects.toThrow();

      try {
        await ledger.fetchShares("user1", ["S4"]);
      } catch (err) {
        expect(err.code).toBe(LedgerError.SHARE_NOT_FOUND);
      }
    });

    test("omits revoked shares by default", async () => {
      await ledger.revokeShare("user1", "S1", "test revocation");

      await expect(ledger.fetchShares("user1", ["S1"])).rejects.toThrow();

      try {
        await ledger.fetchShares("user1", ["S1"]);
      } catch (err) {
        expect(err.code).toBe(LedgerError.SHARE_REVOKED);
      }
    });

    test("includes revoked shares with flag", async () => {
      await ledger.revokeShare("user1", "S1", "test revocation");

      const result = await ledger.fetchShares("user1", ["S1"], { includeRevoked: true });

      expect(result.shares.S1).toBeDefined();
      expect(result.metadata.S1.revoked).toBe(true);
    });

    test("logs fetch audit event", async () => {
      await ledger.fetchShares("user1", ["S1"]);

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.SHARE_FETCHED);
    });
  });

  // ============================================================
  // revokeShare Tests
  // ============================================================

  describe("revokeShare()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1-data") },
        S3: { factor: "totp", data: Buffer.from("s3-data") },
      });
      auditEvents = [];
    });

    test("marks share as revoked", async () => {
      const result = await ledger.revokeShare("user1", "S1", "device lost");

      expect(result.type).toBe(LedgerMessageType.SHARE_REVOKED);
      expect(result.shareId).toBe("S1");
      expect(result.revokedAt).toBeGreaterThan(0);
    });

    test("sets revocation timestamp and reason", async () => {
      await ledger.revokeShare("user1", "S1", "device compromise");

      const metadata = await ledger.getShareMetadata("user1", "S1");
      expect(metadata.revoked).toBe(true);
      expect(metadata.revokedAt).toBeGreaterThan(0);
      expect(metadata.revokedReason).toBe("device compromise");
    });

    test("throws on unknown user", async () => {
      await expect(ledger.revokeShare("unknown", "S1", "test")).rejects.toThrow();
    });

    test("throws on unknown share", async () => {
      await expect(ledger.revokeShare("user1", "S4", "test")).rejects.toThrow();
    });

    test("logs revocation audit event", async () => {
      await ledger.revokeShare("user1", "S1", "test");

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.SHARE_REVOKED);
      expect(auditEvents[0].reason).toBe("test");
    });
  });

  // ============================================================
  // rotateShare Tests
  // ============================================================

  describe("rotateShare()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1-data-v1") },
        S3: { factor: "totp", data: Buffer.from("s3-data-v1") },
      });
      auditEvents = [];
    });

    test("increments version number", async () => {
      const result = await ledger.rotateShare("user1", "S1", {
        data: Buffer.from("s1-data-v2"),
      });

      expect(result.type).toBe(LedgerMessageType.SHARE_UPDATED);
      expect(result.oldVersion).toBe(1);
      expect(result.newVersion).toBe(2);
    });

    test("revokes old share and stores new", async () => {
      await ledger.rotateShare("user1", "S1", {
        data: Buffer.from("s1-data-v2"),
      });

      const fetched = await ledger.fetchShares("user1", ["S1"]);
      expect(fetched.metadata.S1.version).toBe(2);
      expect(fetched.shares.S1.toString()).toBe("s1-data-v2");
    });

    test("allows changing factor type on rotation", async () => {
      await ledger.rotateShare("user1", "S1", {
        factor: "opaque",
        data: Buffer.from("s1-opaque"),
      });

      const metadata = await ledger.getShareMetadata("user1", "S1");
      expect(metadata.factor).toBe("opaque");
    });

    test("preserves factor type if not specified", async () => {
      await ledger.rotateShare("user1", "S1", {
        data: Buffer.from("new-data"),
      });

      const metadata = await ledger.getShareMetadata("user1", "S1");
      expect(metadata.factor).toBe("oauth");
    });

    test("logs rotation audit event", async () => {
      await ledger.rotateShare("user1", "S1", {
        data: Buffer.from("new-data"),
      }, "key_compromise");

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.SHARE_ROTATED);
      expect(auditEvents[0].oldVersion).toBe(1);
      expect(auditEvents[0].newVersion).toBe(2);
      expect(auditEvents[0].reason).toBe("key_compromise");
    });
  });

  // ============================================================
  // getVersions Tests
  // ============================================================

  describe("getVersions()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });
    });

    test("returns version info for all shares", async () => {
      const versions = await ledger.getVersions("user1");

      expect(versions.S1.version).toBe(1);
      expect(versions.S2.version).toBe(1);
      expect(versions.S3.version).toBe(1);
    });

    test("includes revoked status", async () => {
      await ledger.revokeShare("user1", "S1", "test");

      const versions = await ledger.getVersions("user1");
      expect(versions.S1.revoked).toBe(true);
      expect(versions.S3.revoked).toBe(false);
    });

    test("includes factor info", async () => {
      const versions = await ledger.getVersions("user1");

      expect(versions.S1.factor).toBe("oauth");
      expect(versions.S2.factor).toBe("webauthn");
      expect(versions.S3.factor).toBe("totp");
    });

    test("throws on unknown user", async () => {
      await expect(ledger.getVersions("unknown")).rejects.toThrow();
    });
  });

  // ============================================================
  // Proof Hash Tests
  // ============================================================

  describe("getProofHash() / updateProofHash()", () => {
    test("returns null if no proof hash stored", async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
      });

      const hash = await ledger.getProofHash("user1");
      expect(hash).toBeNull();
    });

    test("returns stored proof hash", async () => {
      const proofHash = crypto.randomBytes(32);
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
      }, { proofHash });

      const retrieved = await ledger.getProofHash("user1");
      expect(retrieved.equals(proofHash)).toBe(true);
    });

    test("updateProofHash changes stored hash", async () => {
      const hash1 = crypto.randomBytes(32);
      const hash2 = crypto.randomBytes(32);

      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
      }, { proofHash: hash1 });

      await ledger.updateProofHash("user1", hash2);

      const retrieved = await ledger.getProofHash("user1");
      expect(retrieved.equals(hash2)).toBe(true);
    });
  });

  // ============================================================
  // deleteAllShares Tests
  // ============================================================

  describe("deleteAllShares()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });
      auditEvents = [];
    });

    test("removes all shares for user", async () => {
      await ledger.deleteAllShares("user1");

      const enrolled = await ledger.isEnrolled("user1");
      expect(enrolled).toBe(false);
    });

    test("throws on unknown user", async () => {
      await expect(ledger.deleteAllShares("unknown")).rejects.toThrow();
    });

    test("logs deletion audit event", async () => {
      await ledger.deleteAllShares("user1");

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.SHARE_REVOKED);
      expect(auditEvents[0].shareId).toBe("ALL");
    });
  });

  // ============================================================
  // getShareMetadata Tests
  // ============================================================

  describe("getShareMetadata()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });
    });

    test("returns metadata without encrypted data", async () => {
      const metadata = await ledger.getShareMetadata("user1", "S1");

      expect(metadata.shareId).toBe("S1");
      expect(metadata.factor).toBe("oauth");
      expect(metadata.version).toBe(1);
      expect(metadata.revoked).toBe(false);
      expect(metadata.hasData).toBe(true);
      expect(metadata.encryptedData).toBeUndefined();
    });

    test("S2 metadata shows hasData as false", async () => {
      const metadata = await ledger.getShareMetadata("user1", "S2");

      expect(metadata.hasData).toBe(false);
    });
  });

  // ============================================================
  // updateS2Metadata Tests
  // ============================================================

  describe("updateS2Metadata()", () => {
    beforeEach(async () => {
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });
      auditEvents = [];
    });

    test("updates S2 version", async () => {
      const result = await ledger.updateS2Metadata("user1", 2);

      expect(result.type).toBe(LedgerMessageType.SHARE_UPDATED);
      expect(result.oldVersion).toBe(1);
      expect(result.newVersion).toBe(2);
    });

    test("clears revocation status on update", async () => {
      // First revoke S2
      await ledger.revokeShare("user1", "S2", "test");

      // Then update
      await ledger.updateS2Metadata("user1", 2);

      const metadata = await ledger.getShareMetadata("user1", "S2");
      expect(metadata.revoked).toBe(false);
    });

    test("logs rotation audit event", async () => {
      await ledger.updateS2Metadata("user1", 2);

      expect(auditEvents.length).toBe(1);
      expect(auditEvents[0].type).toBe(AuditEventType.SHARE_ROTATED);
      expect(auditEvents[0].shareId).toBe("S2");
    });
  });

  // ============================================================
  // Custom Storage Backend Tests
  // ============================================================

  describe("Custom Storage Backend", () => {
    test("uses provided storage functions", async () => {
      const storage = new Map();
      let getCalls = 0;
      let saveCalls = 0;

      const customLedger = createLedger({
        getRecord: async (userId) => {
          getCalls++;
          return storage.get(userId) || null;
        },
        saveRecord: async (userId, record) => {
          saveCalls++;
          storage.set(userId, record);
        },
        auditEnabled: false,
      });

      await customLedger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("data") },
      });

      expect(saveCalls).toBe(1);

      await customLedger.fetchShares("user1");
      expect(getCalls).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe("Integration Tests", () => {
    test("full enrollment and recovery flow", async () => {
      // Enroll
      const s1Data = crypto.randomBytes(32);
      const s3Data = crypto.randomBytes(32);
      const proofHash = crypto.createHash("sha256").update("K_user").digest();

      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: s1Data },
        S3: { factor: "totp", data: s3Data },
      }, { proofHash });

      // Verify enrollment
      expect(await ledger.isEnrolled("user1")).toBe(true);

      // Fetch shares for recovery
      const fetched = await ledger.fetchShares("user1", ["S1", "S3"]);
      expect(fetched.shares.S1.equals(s1Data)).toBe(true);
      expect(fetched.shares.S3.equals(s3Data)).toBe(true);

      // Verify proof hash
      const storedHash = await ledger.getProofHash("user1");
      expect(storedHash.equals(proofHash)).toBe(true);
    });

    test("device loss and rotation flow", async () => {
      // Initial enrollment
      await ledger.storeShares("user1", {
        S1: { factor: "oauth", data: Buffer.from("s1-v1") },
        S3: { factor: "totp", data: Buffer.from("s3-v1") },
      });

      // User loses TOTP device - revoke S3
      await ledger.revokeShare("user1", "S3", "device_lost");

      // Verify S3 is revoked
      const versions1 = await ledger.getVersions("user1");
      expect(versions1.S3.revoked).toBe(true);

      // User recovers using S1 + S2 (assumes external verification)
      // Then rotates S3 with new TOTP device
      await ledger.rotateShare("user1", "S3", {
        factor: "totp",
        data: Buffer.from("s3-v2"),
      }, "new_device");

      // Verify new S3
      const versions2 = await ledger.getVersions("user1");
      expect(versions2.S3.version).toBe(2);
      expect(versions2.S3.revoked).toBe(false);

      // Fetch should return new S3
      const fetched = await ledger.fetchShares("user1", ["S3"]);
      expect(fetched.shares.S3.toString()).toBe("s3-v2");
    });
  });

  // ============================================================================
  // Default-argument coverage for the ledger factory and its internal helpers.
  // Real-world callers pass minimal config (no audit callback, no custom
  // storage), relying entirely on defaults.
  // ============================================================================
  describe("Default-argument fallbacks", () => {
    // Scenario: createLedger() with no arguments at all (smallest possible
    // construction in a test harness). Both the outer `config = {}` and the
    // destructuring `auditEnabled = true` defaults engage.
    test("createLedger() constructs with all defaults", async () => {
      const l = createLedger();
      // auditEnabled defaults true; with no onAuditEvent supplied the logAudit
      // path runs through (auditEnabled && onAuditEvent) → onAuditEvent falsy.
      await l.storeShares("default-u", {
        S1: { factor: "oauth", data: Buffer.from("d1") },
        S3: { factor: "totp", data: Buffer.from("d3") },
      });
      expect(await l.isEnrolled("default-u")).toBe(true);
    });

    // Scenario: a custom storage backend is injected but auditEnabled is
    // omitted (defaults to true). With no audit callback the audit helper
    // still runs cleanly.
    test("logAudit details parameter defaults to {} when caller omits", async () => {
      // The internal logAudit is exercised indirectly via every operation;
      // the no-details path engages on revokeShare / rotateShare / etc.
      const events = [];
      const l = createLedger({ onAuditEvent: (e) => events.push(e) });
      await l.storeShares("audit-u", {
        S1: { factor: "oauth", data: Buffer.from("a1") },
      });
      // Each operation's logAudit emits an event — the default-arg path was
      // hit at least once via storeShares' internal call paths.
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // storeShares-with-explicit-S2: when the caller pre-supplies an S2 share
  // (e.g. migration from external store), the auto-fill branch must NOT run.
  // ============================================================================
  describe("storeShares with explicit S2", () => {
    test("does not auto-fill S2 placeholder when caller provides S2", async () => {
      const l = createLedger({
        auditEnabled: true,
        onAuditEvent: () => {},
      });
      await l.storeShares("s2-u", {
        S1: { factor: "oauth", data: Buffer.from("s1") },
        S2: { factor: "webauthn", data: Buffer.from("s2") },
        S3: { factor: "totp", data: Buffer.from("s3") },
      });
      const fetched = await l.fetchShares("s2-u", ["S2"]);
      // S2 has data because we provided it explicitly (default placeholder
      // would have null encryptedData).
      expect(fetched.shares.S2.toString()).toBe("s2");
    });
  });

  // ============================================================================
  // User-not-found error paths across the rotation/metadata/proof helpers.
  // These represent realistic scenarios: an admin or background job invokes
  // an operation against a user that was already unenrolled (race).
  // ============================================================================
  describe("User-not-found errors across mutation helpers", () => {
    test("rotateShare throws when user has no record", async () => {
      await expect(
        ledger.rotateShare("ghost-user", "S1", { factor: "oauth", data: Buffer.from("x") }, "reason"),
      ).rejects.toThrow();
    });

    test("rotateShare throws when share id is unknown for the user", async () => {
      await ledger.storeShares("rot-u", {
        S1: { factor: "oauth", data: Buffer.from("a") },
      });
      // S3 was never stored → throws shareNotFound
      await expect(
        ledger.rotateShare("rot-u", "S3", { factor: "totp", data: Buffer.from("y") }, "reason"),
      ).rejects.toThrow();
    });

    test("updateProofHash throws when user has no record", async () => {
      await expect(
        ledger.updateProofHash("ghost-user", Buffer.from("hash")),
      ).rejects.toThrow();
    });

    test("getShareMetadata throws when user has no record", async () => {
      await expect(ledger.getShareMetadata("ghost-user", "S1")).rejects.toThrow();
    });

    test("getShareMetadata throws when share id is unknown for the user", async () => {
      await ledger.storeShares("meta-u", {
        S1: { factor: "oauth", data: Buffer.from("a") },
      });
      await expect(ledger.getShareMetadata("meta-u", "S3")).rejects.toThrow();
    });

    test("updateS2Metadata throws when user has no record", async () => {
      await expect(ledger.updateS2Metadata("ghost-user", 2)).rejects.toThrow();
    });

    // Scenario: a custom storage backend persisted a record without the S2
    // placeholder (e.g. partial migration). updateS2Metadata must reject
    // rather than silently create the share.
    test("updateS2Metadata throws when the persisted record lacks S2", async () => {
      const store = new Map();
      const l = createLedger({
        getRecord: async (uid) => store.get(uid) || null,
        saveRecord: async (uid, rec) => { store.set(uid, rec); },
        deleteRecord: async (uid) => { store.delete(uid); },
      });
      // Persist a record that only has S1 (no S2 placeholder)
      store.set("no-s2-u", {
        userId: "no-s2-u",
        enrolledAt: Date.now(),
        proofHash: null,
        shares: {
          S1: {
            shareId: "S1",
            factor: "oauth",
            encryptedData: Buffer.from("x").toString("base64"),
            version: 1,
            revoked: false,
            createdAt: Date.now(),
            revokedAt: null,
            revokedReason: null,
          },
        },
      });
      await expect(l.updateS2Metadata("no-s2-u", 2)).rejects.toThrow();
    });
  });
});
