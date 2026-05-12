/**
 * @fileoverview Tests for Two-of-Three Authentication Adapter
 * @module server/security/auth/mfa/two-of-three.test
 */

"use strict";

const {
  createTwoOfThreeStrategy,
  Strategy,
  TwoOfThreeMessageType,
  TwoOfThreeError,
  DEFAULT_CONFIG,
} = require("./two-of-three");

const crypto = require("crypto");

describe("Two-of-Three Adapter", () => {
  let strategy;

  beforeEach(() => {
    strategy = createTwoOfThreeStrategy({
      enrollmentTimeout: 5000, // Short timeout for tests
    });
  });

  // ============================================================
  // Strategy Interface Tests
  // ============================================================

  describe("Strategy Interface", () => {
    test("exports Strategy alias", () => {
      expect(Strategy).toBe(createTwoOfThreeStrategy);
    });

    test("has Passport.js required properties", () => {
      expect(strategy.name).toBe("two-of-three");
      expect(typeof strategy.authenticate).toBe("function");
    });

    test("has api-ape adapter properties", () => {
      expect(strategy.type).toBe("two-of-three");
      expect(strategy.tier).toBe(3);
    });

    test("exposes message types and errors", () => {
      expect(strategy.MessageType).toBe(TwoOfThreeMessageType);
      expect(strategy.Error).toBe(TwoOfThreeError);
    });

    test("accepts Passport.js style constructor (options, verify)", () => {
      const verifyFn = jest.fn();
      const s = createTwoOfThreeStrategy({ requiredFactors: 2 }, verifyFn);

      expect(s.name).toBe("two-of-three");
    });

    test("accepts Passport.js style constructor (verify only)", () => {
      const verifyFn = jest.fn();
      const s = createTwoOfThreeStrategy(verifyFn);

      expect(s.name).toBe("two-of-three");
    });
  });

  // ============================================================
  // Enrollment Flow Tests
  // ============================================================

  describe("Enrollment Flow", () => {
    test("handleEnrollmentStart returns challenge and shares", async () => {
      const result = await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      expect(result.type).toBe(TwoOfThreeMessageType.ENROLLMENT_CHALLENGE);
      expect(result.challenge).toBeDefined();
      expect(typeof result.challenge).toBe("string");
      expect(result.s3Salt).toBeDefined();
      expect(result.shares.S1).toBeDefined();
      expect(result.shares.S2).toBeDefined();
      expect(result.shares.S3).toBeDefined();
      expect(result.factorRequirements).toBeDefined();
    });

    test("handleEnrollmentStart creates pending enrollment", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      expect(strategy._pendingEnrollments.size).toBe(1);
    });

    test("handleEnrollmentFinish stores shares", async () => {
      // Start enrollment
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      // Finish enrollment
      const result = await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      expect(result.type).toBe(TwoOfThreeMessageType.ENROLLMENT_OK);
      expect(result.shares.S1.stored).toBe(true);
      expect(result.shares.S2.stored).toBe(false);
      expect(result.shares.S3.stored).toBe(true);
    });

    test("handleEnrollmentFinish clears pending enrollment", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      expect(strategy._pendingEnrollments.size).toBe(0);
    });

    test("rejects duplicate enrollment start", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      await expect(
        strategy.handleEnrollmentStart({
          clientId: "client1",
          userId: "user1",
        })
      ).rejects.toThrow();

      try {
        await strategy.handleEnrollmentStart({
          clientId: "client1",
          userId: "user1",
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.PENDING_ENROLLMENT);
      }
    });

    test("rejects enrollment for already enrolled user", async () => {
      // Complete first enrollment
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      // Try to start second enrollment
      await expect(
        strategy.handleEnrollmentStart({
          clientId: "client2",
          userId: "user1",
        })
      ).rejects.toThrow();

      try {
        await strategy.handleEnrollmentStart({
          clientId: "client2",
          userId: "user1",
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.ALREADY_ENROLLED);
      }
    });

    test("handleEnrollmentFinish fails without pending enrollment", async () => {
      await expect(
        strategy.handleEnrollmentFinish({
          clientId: "client1",
          userId: "user1",
          encryptedShares: {
            S1: "data",
            S3: "data",
          },
        })
      ).rejects.toThrow();

      try {
        await strategy.handleEnrollmentFinish({
          clientId: "client1",
          userId: "user1",
          encryptedShares: { S1: "data", S3: "data" },
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.ENROLLMENT_EXPIRED);
      }
    });

    test("handleEnrollmentFinish fails with missing shares", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      await expect(
        strategy.handleEnrollmentFinish({
          clientId: "client1",
          userId: "user1",
          encryptedShares: {
            S1: crypto.randomBytes(64).toString("base64"),
            // Missing S3
          },
        })
      ).rejects.toThrow();
    });

    test("enrollment expires after timeout", async () => {
      const shortTimeoutStrategy = createTwoOfThreeStrategy({
        enrollmentTimeout: 100, // 100ms
      });

      await shortTimeoutStrategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      await expect(
        shortTimeoutStrategy.handleEnrollmentFinish({
          clientId: "client1",
          userId: "user1",
          encryptedShares: {
            S1: crypto.randomBytes(64).toString("base64"),
            S3: crypto.randomBytes(64).toString("base64"),
          },
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // Recovery Flow Tests
  // ============================================================

  describe("Recovery Flow", () => {
    beforeEach(async () => {
      // Set up enrolled user
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
    });

    test("handleRecoveryStart returns encrypted shares", async () => {
      const result = await strategy.handleRecoveryStart({
        clientId: "client2",
        userId: "user1",
      });

      expect(result.type).toBe(TwoOfThreeMessageType.RECOVERY_SHARES);
      expect(result.challenge).toBeDefined();
      expect(result.encShares.S1).toBeDefined();
      expect(result.encShares.S3).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    test("handleRecoveryComplete elevates to Tier 3", async () => {
      await strategy.handleRecoveryStart({
        clientId: "client2",
        userId: "user1",
      });

      const result = await strategy.handleRecoveryComplete({
        clientId: "client2",
        userId: "user1",
      });

      expect(result.type).toBe(TwoOfThreeMessageType.RECOVERY_OK);
      expect(result.tier).toBe(3);
    });

    test("handleRecoveryStart fails for non-enrolled user", async () => {
      await expect(
        strategy.handleRecoveryStart({
          clientId: "client1",
          userId: "unknown-user",
        })
      ).rejects.toThrow();

      try {
        await strategy.handleRecoveryStart({
          clientId: "client1",
          userId: "unknown-user",
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.NOT_ENROLLED);
      }
    });

    test("handleRecoveryComplete fails without pending recovery", async () => {
      await expect(
        strategy.handleRecoveryComplete({
          clientId: "client1",
          userId: "user1",
        })
      ).rejects.toThrow();

      try {
        await strategy.handleRecoveryComplete({
          clientId: "client1",
          userId: "user1",
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.INVALID_FLOW);
      }
    });

    // Scenario: a recovery client submits a valid HMAC-SHA256 proof using
    // the stored proof-hash secret. The handler validates and elevates.
    test("handleRecoveryComplete accepts a matching proof", async () => {
      const start = await strategy.handleRecoveryStart({
        clientId: "client-proof",
        userId: "user1",
      });
      // Reproduce the proof using the same secret the handler stored.
      // The proof secret is the proofHash recorded by handleEnrollmentFinish
      // (which is computeProofHash(kUser)). We replay the math by reading
      // it from the ledger via the strategy's exposed _ledger.
      const proofHash = await strategy.ledger.getProofHash("user1");
      const expectedProof = crypto
        .createHmac("sha256", proofHash)
        .update(start.challenge)
        .digest("base64");
      const result = await strategy.handleRecoveryComplete({
        clientId: "client-proof",
        userId: "user1",
        proof: expectedProof,
      });
      expect(result.type).toBe(TwoOfThreeMessageType.RECOVERY_OK);
      expect(result.tier).toBe(3);
    });

    // Scenario: an attacker submits an arbitrary string as the proof. The
    // handler must compare against the stored HMAC, fail to match, and
    // reject with INVALID_PROOF.
    test("handleRecoveryComplete rejects a non-matching proof", async () => {
      await strategy.handleRecoveryStart({
        clientId: "client-bad-proof",
        userId: "user1",
      });
      await expect(
        strategy.handleRecoveryComplete({
          clientId: "client-bad-proof",
          userId: "user1",
          proof: "Y29tcGxldGVseS13cm9uZw==", // arbitrary base64
        }),
      ).rejects.toMatchObject({ code: TwoOfThreeError.INVALID_PROOF });
    });
  });

  // ============================================================
  // Enrollment-expiry timer + late-finish edge cases
  // ============================================================
  describe("Enrollment session expiry", () => {
    // Scenario: a user starts enrollment, then the auto-cleanup timer fires
    // after `enrollmentTimeout + 1000`ms. The pending entry must be
    // garbage-collected by the timer.
    test("auto-cleanup timer removes the pending enrollment", async () => {
      jest.useFakeTimers();
      try {
        const s = createTwoOfThreeStrategy({ enrollmentTimeout: 1000 });
        await s.handleEnrollmentStart({
          clientId: "timer-c",
          userId: "timer-u",
        });
        expect(s._pendingEnrollments.size).toBe(1);
        jest.advanceTimersByTime(2001);
        expect(s._pendingEnrollments.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    // Scenario: a client races the cleanup timer — submits a finish call
    // after the pending entry's `expiresAt` has passed but before the
    // cleanup timer's interval has fired. The handler must reject with
    // ENROLLMENT_EXPIRED and remove the stale entry itself.
    test("handleEnrollmentFinish rejects when expiresAt has passed", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client-late",
        userId: "user-late",
      });
      const entry = strategy._pendingEnrollments.get("client-late:user-late");
      entry.expiresAt = Date.now() - 1000;
      await expect(
        strategy.handleEnrollmentFinish({
          clientId: "client-late",
          userId: "user-late",
          encryptedShares: {
            S1: crypto.randomBytes(64).toString("base64"),
            S3: crypto.randomBytes(64).toString("base64"),
          },
        }),
      ).rejects.toMatchObject({ code: TwoOfThreeError.ENROLLMENT_EXPIRED });
      expect(strategy._pendingEnrollments.has("client-late:user-late")).toBe(false);
    });
  });

  // ============================================================
  // Recovery-start with partial shares: the ledger may legitimately return
  // missing share buffers when a share was rotated to a tombstone or the
  // factor adapter is unavailable. The `?.toString("base64") || null`
  // short-circuit must fall through to `null` for the missing share.
  // ============================================================
  describe("Recovery start with missing share buffers", () => {
    test("encShares fall back to null when ledger returns missing shares", async () => {
      const s = createTwoOfThreeStrategy({ enrollmentTimeout: 5000 });
      // Enroll first, then mutate the ledger to drop S3's data
      await s.handleEnrollmentStart({
        clientId: "missing-c",
        userId: "missing-u",
      });
      await s.handleEnrollmentFinish({
        clientId: "missing-c",
        userId: "missing-u",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      // Patch fetchShares on the ledger to return only S1
      const origFetch = s.ledger.fetchShares.bind(s.ledger);
      s.ledger.fetchShares = async (uid, ids) => {
        const out = await origFetch(uid, ids);
        return { shares: { S1: out.shares.S1 }, metadata: out.metadata };
      };
      const result = await s.handleRecoveryStart({
        clientId: "missing-c2",
        userId: "missing-u",
      });
      expect(result.encShares.S3).toBeNull();
    });

    // Scenario: the S1 buffer is also missing (e.g. tombstoned during a
    // simultaneous re-enroll race). The LHS `?.toString("base64")` returns
    // undefined so the `|| null` short-circuit picks null.
    test("encShares.S1 falls back to null when ledger returns no S1", async () => {
      const s = createTwoOfThreeStrategy({ enrollmentTimeout: 5000 });
      await s.handleEnrollmentStart({
        clientId: "no-s1-c",
        userId: "no-s1-u",
      });
      await s.handleEnrollmentFinish({
        clientId: "no-s1-c",
        userId: "no-s1-u",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      s.ledger.fetchShares = async () => ({
        shares: {},
        metadata: {},
      });
      const result = await s.handleRecoveryStart({
        clientId: "no-s1-c2",
        userId: "no-s1-u",
      });
      expect(result.encShares.S1).toBeNull();
      expect(result.encShares.S3).toBeNull();
    });
  });

  // Scenario: a legacy enrollment record never persisted a proof hash (e.g.
  // upgraded from a pre-proof schema). The client sends a proof but
  // ledger.getProofHash returns null/undefined — the verification block
  // skips and the recovery completes via the no-proof path.
  describe("Recovery with missing stored proofHash", () => {
    test("skips proof validation when ledger has no proofHash for the user", async () => {
      const s = createTwoOfThreeStrategy({ enrollmentTimeout: 5000 });
      await s.handleEnrollmentStart({
        clientId: "noph-c",
        userId: "noph-u",
      });
      await s.handleEnrollmentFinish({
        clientId: "noph-c",
        userId: "noph-u",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      // Make the ledger report no proofHash for this user
      s.ledger.getProofHash = async () => null;
      await s.handleRecoveryStart({
        clientId: "noph-c2",
        userId: "noph-u",
      });
      const result = await s.handleRecoveryComplete({
        clientId: "noph-c2",
        userId: "noph-u",
        proof: "any-proof",
      });
      expect(result.type).toBe(TwoOfThreeMessageType.RECOVERY_OK);
    });
  });

  // ============================================================
  // Rotation Tests
  // ============================================================

  describe("Rotation Flow", () => {
    beforeEach(async () => {
      // Set up enrolled user
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
    });

    test("handleRotation rotates S1", async () => {
      const result = await strategy.handleRotation({
        clientId: "client1",
        userId: "user1",
        shareId: "S1",
        encryptedShare: crypto.randomBytes(64).toString("base64"),
        reason: "key_compromise",
      });

      expect(result.type).toBe(TwoOfThreeMessageType.ROTATION_OK);
      expect(result.shareId).toBe("S1");
      expect(result.oldVersion).toBe(1);
      expect(result.newVersion).toBe(2);
    });

    test("handleRotation rotates S3", async () => {
      const result = await strategy.handleRotation({
        clientId: "client1",
        userId: "user1",
        shareId: "S3",
        encryptedShare: crypto.randomBytes(64).toString("base64"),
      });

      expect(result.type).toBe(TwoOfThreeMessageType.ROTATION_OK);
      expect(result.shareId).toBe("S3");
      expect(result.newVersion).toBe(2);
    });

    test("handleRotation updates S2 metadata only", async () => {
      const result = await strategy.handleRotation({
        clientId: "client1",
        userId: "user1",
        shareId: "S2",
        encryptedShare: "not-stored", // S2 data is client-stored
      });

      expect(result.type).toBe(TwoOfThreeMessageType.ROTATION_OK);
      expect(result.shareId).toBe("S2");
      expect(result.newVersion).toBe(2);
    });

    test("handleRotation fails for invalid share ID", async () => {
      await expect(
        strategy.handleRotation({
          clientId: "client1",
          userId: "user1",
          shareId: "S4",
          encryptedShare: "data",
        })
      ).rejects.toThrow();

      try {
        await strategy.handleRotation({
          clientId: "client1",
          userId: "user1",
          shareId: "S4",
          encryptedShare: "data",
        });
      } catch (err) {
        expect(err.code).toBe(TwoOfThreeError.INVALID_FACTOR);
      }
    });

    test("handleRotation fails for non-enrolled user", async () => {
      await expect(
        strategy.handleRotation({
          clientId: "client1",
          userId: "unknown-user",
          shareId: "S1",
          encryptedShare: "data",
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // Passport.js authenticate Tests
  // ============================================================

  describe("Passport.js authenticate()", () => {
    test("calls this.success() on valid factors", (done) => {
      const context = {
        success: (user, info) => {
          expect(user.userId).toBe("user1");
          expect(user.tier).toBe(3);
          done();
        },
        fail: () => done(new Error("Should not fail")),
        error: (err) => done(err),
      };

      strategy.authenticate.call(context, {
        body: {
          userId: "user1",
          factors: {
            oauth: { token: "xyz" },
            totp: { code: "123456" },
          },
        },
      });
    });

    test("calls this.fail() on insufficient factors", (done) => {
      const context = {
        success: () => done(new Error("Should not succeed")),
        fail: (info) => {
          expect(info.code).toBe(TwoOfThreeError.INSUFFICIENT_FACTORS);
          done();
        },
        error: (err) => done(err),
      };

      strategy.authenticate.call(context, {
        body: {
          userId: "user1",
          factors: {
            oauth: { token: "xyz" },
            // Missing second factor
          },
        },
      });
    });

    test("calls verify callback when provided", (done) => {
      const verifyFn = jest.fn((data, verified) => {
        expect(data.userId).toBe("user1");
        expect(data.factors.oauth).toBeDefined();
        verified(null, { userId: data.userId }, { verified: true });
      });

      const strategyWithVerify = createTwoOfThreeStrategy({}, verifyFn);

      const context = {
        success: (user, info) => {
          expect(verifyFn).toHaveBeenCalled();
          expect(info.verified).toBe(true);
          done();
        },
        fail: () => done(new Error("Should not fail")),
        error: (err) => done(err),
      };

      strategyWithVerify.authenticate.call(context, {
        body: {
          userId: "user1",
          factors: {
            oauth: { token: "xyz" },
            totp: { code: "123456" },
          },
        },
      });
    });

    // Scenario: constructor called with no arguments — `options || {}` RHS engages.
    test("createTwoOfThreeStrategy() with no args constructs with defaults", () => {
      const s = createTwoOfThreeStrategy();
      expect(s.name).toBe("two-of-three");
    });

    // Scenario: request is a plain object (not an Express req with .body).
    // `req.body || req` RHS engages.
    test("authenticate accepts request without .body", () => {
      const c = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      strategy.authenticate.call(c, {
        userId: "u",
        factors: { oauth: {}, totp: {} },
      });
      expect(c.success).toHaveBeenCalled();
    });

    // Scenario: caller submits a factor flow not in `allowedFlows`. The
    // `!allowedFlows.some(...)` true branch engages and self.fail with
    // INVALID_FLOW.
    test("authenticate fails when factor flow is not in allowedFlows", () => {
      const restricted = createTwoOfThreeStrategy({
        allowedFlows: ["oauth+totp"], // only this single flow
      });
      const c = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      restricted.authenticate.call(c, {
        body: { userId: "u", factors: { webauthn: {}, totp: {} } },
      });
      expect(c.fail).toHaveBeenCalledWith(expect.objectContaining({
        code: TwoOfThreeError.INVALID_FLOW,
      }));
    });

    // Scenario: verify callback signals error via done(err).
    test("verifyCallback done(err) routes to self.error", () => {
      const verifyFn = jest.fn((data, done) => done(new Error("verify fail")));
      const s = createTwoOfThreeStrategy({}, verifyFn);
      const c = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      s.authenticate.call(c, {
        body: { userId: "u", factors: { oauth: {}, totp: {} } },
      });
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
    });

    // Scenario: verify callback signals failure with done(null, false).
    test("verifyCallback done(null, false) routes to self.fail", () => {
      const verifyFn = jest.fn((data, done) => done(null, false, { reason: "x" }));
      const s = createTwoOfThreeStrategy({}, verifyFn);
      const c = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      s.authenticate.call(c, {
        body: { userId: "u", factors: { oauth: {}, totp: {} } },
      });
      expect(c.fail).toHaveBeenCalledWith({ reason: "x" });
    });

    test("passes request to verify callback with passReqToCallback", (done) => {
      const verifyFn = jest.fn((req, data, verified) => {
        expect(req.body).toBeDefined();
        verified(null, { userId: data.userId });
      });

      const strategyWithReq = createTwoOfThreeStrategy(
        { passReqToCallback: true },
        verifyFn
      );

      const context = {
        success: () => done(),
        fail: () => done(new Error("Should not fail")),
        error: (err) => done(err),
      };

      strategyWithReq.authenticate.call(context, {
        body: {
          userId: "user1",
          factors: {
            oauth: {},
            webauthn: {},
          },
        },
      });
    });
  });

  // ============================================================
  // Utility Method Tests
  // ============================================================

  describe("Utility Methods", () => {
    test("isEnrolled returns false for new user", async () => {
      const enrolled = await strategy.isEnrolled("new-user");
      expect(enrolled).toBe(false);
    });

    test("isEnrolled returns true after enrollment", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      const enrolled = await strategy.isEnrolled("user1");
      expect(enrolled).toBe(true);
    });

    test("cleanupClient removes pending operations", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      expect(strategy._pendingEnrollments.size).toBe(1);

      strategy.cleanupClient("client1");

      expect(strategy._pendingEnrollments.size).toBe(0);
    });

    // Scenario: a pending recovery entry is past its expiresAt. The next
    // handler call invokes cleanupExpired which iterates pendingRecoveries
    // and removes the stale entry — exercising the `pending.expiresAt < now`
    // true branch in the recoveries loop.
    test("cleanupExpired purges expired recoveries on next handler call", async () => {
      const s = createTwoOfThreeStrategy({ enrollmentTimeout: 5000 });
      await s.handleEnrollmentStart({ clientId: "expr-c", userId: "user1" });
      await s.handleEnrollmentFinish({
        clientId: "expr-c",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      // Start recovery, then manually expire the entry
      await s.handleRecoveryStart({ clientId: "expr-c2", userId: "user1" });
      const key = "expr-c2:user1";
      const entry = s._pendingRecoveries.get(key);
      entry.expiresAt = Date.now() - 1000;
      // Any handler call now triggers cleanupExpired which removes the entry
      await expect(
        s.handleRecoveryComplete({
          clientId: "expr-c2",
          userId: "user1",
          proof: "anything",
        }),
      ).rejects.toThrow();
      expect(s._pendingRecoveries.has(key)).toBe(false);
    });

    // Scenario: direct verification of the verifyProof helper used by
    // integrators who want to validate a K_user proof against a stored
    // hash outside the standard recovery flow.
    test("verifyProof returns true for a matching K_user / stored proofHash pair", () => {
      const { computeProofHash, verifyProof } = require("./two-of-three/helpers");
      const kUser = crypto.randomBytes(32);
      const proofHash = computeProofHash(kUser);
      expect(verifyProof(kUser, proofHash)).toBe(true);
    });

    test("verifyProof returns false for a non-matching K_user", () => {
      const { computeProofHash, verifyProof } = require("./two-of-three/helpers");
      const realKey = crypto.randomBytes(32);
      const forgedKey = crypto.randomBytes(32);
      const proofHash = computeProofHash(realKey);
      expect(verifyProof(forgedKey, proofHash)).toBe(false);
    });

    // Scenario: cleanupClient runs while two clients have pending entries.
    // Only the target client's entries are removed; the other client's
    // remain. Exercises both branches of the `startsWith` check on both
    // the enrollments and recoveries maps.
    test("cleanupClient leaves other clients' entries intact and clears recoveries", async () => {
      const s = createTwoOfThreeStrategy({ enrollmentTimeout: 5000 });
      // Two ongoing enrollments — neither finished yet — to exercise the
      // enrollments-loop branches (alpha key matches; beta key doesn't).
      await s.handleEnrollmentStart({ clientId: "alpha", userId: "user-c" });
      await s.handleEnrollmentStart({ clientId: "beta", userId: "user-d" });
      expect(s._pendingEnrollments.size).toBe(2);
      // Now start a separate enrollment+finish flow for the recovery test,
      // using different users so the in-flight enrollments above survive.
      await s.handleEnrollmentStart({ clientId: "alpha", userId: "user-a" });
      await s.handleEnrollmentStart({ clientId: "beta", userId: "user-b" });
      // Enroll user-a so we can start a recovery for them
      await s.handleEnrollmentFinish({
        clientId: "alpha",
        userId: "user-a",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      await s.handleRecoveryStart({ clientId: "alpha", userId: "user-a" });
      // Now also seed a recovery under beta to ensure recoveries map has
      // entries with different client prefixes.
      await s.handleEnrollmentFinish({
        clientId: "beta",
        userId: "user-b",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });
      await s.handleRecoveryStart({ clientId: "beta", userId: "user-b" });

      expect(s._pendingRecoveries.size).toBe(2);
      s.cleanupClient("alpha");
      // Only alpha's recoveries cleared; beta's remain
      expect(s._pendingRecoveries.size).toBe(1);
      // Beta still has a recovery entry — only the alpha one was removed
      const remainingKeys = [...s._pendingRecoveries.keys()];
      expect(remainingKeys.every((k) => k.startsWith("beta:"))).toBe(true);
    });

    test("getShareVersions returns version info", async () => {
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      const versions = await strategy.getShareVersions("user1");

      expect(versions.S1.version).toBe(1);
      expect(versions.S2.version).toBe(1);
      expect(versions.S3.version).toBe(1);
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe("Integration Tests", () => {
    test("full enrollment and recovery flow", async () => {
      // 1. Start enrollment
      const enrollStart = await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });

      expect(enrollStart.shares.S1).toBeDefined();
      expect(enrollStart.shares.S2).toBeDefined();
      expect(enrollStart.shares.S3).toBeDefined();

      // 2. Finish enrollment (simulate client encrypting shares)
      const enrollFinish = await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      expect(enrollFinish.type).toBe(TwoOfThreeMessageType.ENROLLMENT_OK);

      // 3. Verify enrolled
      expect(await strategy.isEnrolled("user1")).toBe(true);

      // 4. Start recovery
      const recoveryStart = await strategy.handleRecoveryStart({
        clientId: "client2",
        userId: "user1",
      });

      expect(recoveryStart.type).toBe(TwoOfThreeMessageType.RECOVERY_SHARES);
      expect(recoveryStart.encShares.S1).toBeDefined();
      expect(recoveryStart.encShares.S3).toBeDefined();

      // 5. Complete recovery (client reconstructs K_user)
      const recoveryComplete = await strategy.handleRecoveryComplete({
        clientId: "client2",
        userId: "user1",
      });

      expect(recoveryComplete.type).toBe(TwoOfThreeMessageType.RECOVERY_OK);
      expect(recoveryComplete.tier).toBe(3);
    });

    test("device loss and rotation flow", async () => {
      // 1. Initial enrollment
      await strategy.handleEnrollmentStart({
        clientId: "client1",
        userId: "user1",
      });
      await strategy.handleEnrollmentFinish({
        clientId: "client1",
        userId: "user1",
        encryptedShares: {
          S1: crypto.randomBytes(64).toString("base64"),
          S3: crypto.randomBytes(64).toString("base64"),
        },
      });

      // 2. Get initial versions
      const versions1 = await strategy.getShareVersions("user1");
      expect(versions1.S3.version).toBe(1);

      // 3. User loses TOTP device, rotates S3
      const rotation = await strategy.handleRotation({
        clientId: "client1",
        userId: "user1",
        shareId: "S3",
        encryptedShare: crypto.randomBytes(64).toString("base64"),
        reason: "device_lost",
      });

      expect(rotation.newVersion).toBe(2);

      // 4. Verify new version
      const versions2 = await strategy.getShareVersions("user1");
      expect(versions2.S3.version).toBe(2);
    });
  });
});
