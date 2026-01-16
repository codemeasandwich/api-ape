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
