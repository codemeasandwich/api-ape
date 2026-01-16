/**
 * @fileoverview Tests for Recovery Handler
 * @module server/security/auth/mfa/recovery.test
 */

"use strict";

const {
  createRecoveryHandler,
  RecoveryMessageType,
  RecoveryError,
  RECOVERY_REQUIREMENTS,
} = require("./recovery");

const { createTwoOfThreeStrategy } = require("./two-of-three");
const { ShareId } = require("./ledger");
const crypto = require("crypto");

describe("Recovery Handler", () => {
  let twoOfThreeAdapter;
  let recoveryHandler;

  beforeEach(async () => {
    // Create adapter and enroll a user
    twoOfThreeAdapter = createTwoOfThreeStrategy({
      enrollmentTimeout: 5000,
    });

    // Enroll user1
    await twoOfThreeAdapter.handleEnrollmentStart({
      clientId: "client1",
      userId: "user1",
    });
    await twoOfThreeAdapter.handleEnrollmentFinish({
      clientId: "client1",
      userId: "user1",
      encryptedShares: {
        S1: crypto.randomBytes(64).toString("base64"),
        S3: crypto.randomBytes(64).toString("base64"),
      },
    });

    // Create recovery handler
    recoveryHandler = createRecoveryHandler({
      twoOfThreeAdapter,
      recoveryTimeout: 5000,
    });
  });

  // ============================================================
  // Recovery Handler Creation Tests
  // ============================================================

  describe("createRecoveryHandler()", () => {
    test("throws if twoOfThreeAdapter not provided", () => {
      expect(() => createRecoveryHandler({})).toThrow();
    });

    test("creates handler with message types and errors", () => {
      expect(recoveryHandler.MessageType).toBe(RecoveryMessageType);
      expect(recoveryHandler.Error).toBe(RecoveryError);
    });
  });

  // ============================================================
  // handleLostDeviceStart Tests
  // ============================================================

  describe("handleLostDeviceStart()", () => {
    test("returns challenge for lost S1 (OAuth)", async () => {
      const result = await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S1",
      });

      expect(result.type).toBe(RecoveryMessageType.LOST_DEVICE_CHALLENGE);
      expect(result.lostFactor).toBe("S1");
      expect(result.challenge).toBeDefined();
      expect(result.requiredFactors).toEqual(["S2", "S3"]);
    });

    test("returns challenge for lost S2 (WebAuthn)", async () => {
      const result = await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S2",
      });

      expect(result.requiredFactors).toEqual(["S1", "S3"]);
      expect(result.description).toContain("OAuth + TOTP");
    });

    test("returns challenge for lost S3 (TOTP)", async () => {
      const result = await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      expect(result.requiredFactors).toEqual(["S1", "S2"]);
      expect(result.description).toContain("OAuth + WebAuthn");
    });

    test("throws on invalid lost factor", async () => {
      await expect(
        recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "user1",
          lostFactor: "S4",
        })
      ).rejects.toThrow();

      try {
        await recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "user1",
          lostFactor: "S4",
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.INVALID_LOST_FACTOR);
      }
    });

    test("throws for non-enrolled user", async () => {
      await expect(
        recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "unknown-user",
          lostFactor: "S1",
        })
      ).rejects.toThrow();

      try {
        await recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "unknown-user",
          lostFactor: "S1",
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.NOT_ENROLLED);
      }
    });

    test("throws if recovery already in progress", async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S1",
      });

      await expect(
        recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "user1",
          lostFactor: "S2",
        })
      ).rejects.toThrow();

      try {
        await recoveryHandler.handleLostDeviceStart({
          clientId: "client2",
          userId: "user1",
          lostFactor: "S2",
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.RECOVERY_IN_PROGRESS);
      }
    });
  });

  // ============================================================
  // handleVerifyFactor Tests
  // ============================================================

  describe("handleVerifyFactor()", () => {
    beforeEach(async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3", // Lost TOTP, need S1+S2
      });
    });

    test("verifies a required factor", async () => {
      const result = await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "oauth-token" },
      });

      expect(result.type).toBe(RecoveryMessageType.LOST_DEVICE_VERIFY);
      expect(result.verified).toBe(true);
      expect(result.remainingFactors).toEqual(["S2"]);
      expect(result.readyForRegeneration).toBe(false);
    });

    test("indicates ready when all factors verified", async () => {
      await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "oauth-token" },
      });

      const result = await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S2",
        verification: { assertion: "webauthn-assertion" },
      });

      expect(result.remainingFactors).toEqual([]);
      expect(result.readyForRegeneration).toBe(true);
    });

    test("throws without pending recovery", async () => {
      await expect(
        recoveryHandler.handleVerifyFactor({
          clientId: "client3", // Different client
          userId: "user1",
          factor: "S1",
          verification: {},
        })
      ).rejects.toThrow();

      try {
        await recoveryHandler.handleVerifyFactor({
          clientId: "client3",
          userId: "user1",
          factor: "S1",
          verification: {},
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.NO_PENDING_RECOVERY);
      }
    });

    test("throws for factor not required in recovery", async () => {
      // S3 is the lost factor, so it's not a required factor
      await expect(
        recoveryHandler.handleVerifyFactor({
          clientId: "client2",
          userId: "user1",
          factor: "S3",
          verification: { code: "123456" },
        })
      ).rejects.toThrow();
    });

    test("uses custom verification function", async () => {
      const verifyOAuth = jest.fn().mockResolvedValue(true);

      const handlerWithVerify = createRecoveryHandler({
        twoOfThreeAdapter,
        verifyOAuth,
      });

      await handlerWithVerify.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      await handlerWithVerify.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "test-token" },
      });

      expect(verifyOAuth).toHaveBeenCalledWith("user1", "test-token");
    });

    test("throws when verification fails", async () => {
      const verifyOAuth = jest.fn().mockResolvedValue(false);

      const handlerWithVerify = createRecoveryHandler({
        twoOfThreeAdapter,
        verifyOAuth,
      });

      await handlerWithVerify.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      await expect(
        handlerWithVerify.handleVerifyFactor({
          clientId: "client2",
          userId: "user1",
          factor: "S1",
          verification: { token: "bad-token" },
        })
      ).rejects.toThrow();

      try {
        await handlerWithVerify.handleVerifyFactor({
          clientId: "client2",
          userId: "user1",
          factor: "S1",
          verification: { token: "bad-token" },
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.FACTOR_VERIFICATION_FAILED);
      }
    });
  });

  // ============================================================
  // handleRegenerateShare Tests
  // ============================================================

  describe("handleRegenerateShare()", () => {
    beforeEach(async () => {
      // Start recovery and verify all factors
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "oauth-token" },
      });

      await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S2",
        verification: { assertion: "webauthn-assertion" },
      });
    });

    test("regenerates lost share", async () => {
      const result = await recoveryHandler.handleRegenerateShare({
        clientId: "client2",
        userId: "user1",
        newEncryptedShare: crypto.randomBytes(64).toString("base64"),
      });

      expect(result.type).toBe(RecoveryMessageType.RECOVERY_OK);
      expect(result.lostFactor).toBe("S3");
      expect(result.newVersion).toBe(2);
    });

    test("clears pending recovery after success", async () => {
      await recoveryHandler.handleRegenerateShare({
        clientId: "client2",
        userId: "user1",
        newEncryptedShare: crypto.randomBytes(64).toString("base64"),
      });

      const status = recoveryHandler.getPendingRecoveryStatus("client2", "user1");
      expect(status).toBeNull();
    });

    test("throws without pending recovery", async () => {
      await expect(
        recoveryHandler.handleRegenerateShare({
          clientId: "client3",
          userId: "user1",
          newEncryptedShare: "data",
        })
      ).rejects.toThrow();
    });

    test("throws if not all factors verified", async () => {
      // Start new recovery without completing verification
      const newHandler = createRecoveryHandler({
        twoOfThreeAdapter,
      });

      await newHandler.handleLostDeviceStart({
        clientId: "client3",
        userId: "user1",
        lostFactor: "S3",
      });

      // Only verify one factor
      await newHandler.handleVerifyFactor({
        clientId: "client3",
        userId: "user1",
        factor: "S1",
        verification: {},
      });

      await expect(
        newHandler.handleRegenerateShare({
          clientId: "client3",
          userId: "user1",
          newEncryptedShare: "data",
        })
      ).rejects.toThrow();

      try {
        await newHandler.handleRegenerateShare({
          clientId: "client3",
          userId: "user1",
          newEncryptedShare: "data",
        });
      } catch (err) {
        expect(err.code).toBe(RecoveryError.INSUFFICIENT_REMAINING_FACTORS);
      }
    });
  });

  // ============================================================
  // Convenience Method Tests
  // ============================================================

  describe("Convenience Methods", () => {
    test("handleLostWebAuthn starts S2 recovery", async () => {
      const result = await recoveryHandler.handleLostWebAuthn({
        clientId: "client2",
        userId: "user1",
      });

      expect(result.lostFactor).toBe("S2");
      expect(result.requiredFactors).toEqual(["S1", "S3"]);
    });

    test("handleLostTOTP starts S3 recovery", async () => {
      const result = await recoveryHandler.handleLostTOTP({
        clientId: "client2",
        userId: "user1",
      });

      expect(result.lostFactor).toBe("S3");
      expect(result.requiredFactors).toEqual(["S1", "S2"]);
    });

    test("handleOAuthRotation starts S1 recovery", async () => {
      const result = await recoveryHandler.handleOAuthRotation({
        clientId: "client2",
        userId: "user1",
      });

      expect(result.lostFactor).toBe("S1");
      expect(result.requiredFactors).toEqual(["S2", "S3"]);
    });
  });

  // ============================================================
  // Status and Management Tests
  // ============================================================

  describe("Status and Management", () => {
    test("getPendingRecoveryStatus returns null when no recovery", () => {
      const status = recoveryHandler.getPendingRecoveryStatus("client2", "user1");
      expect(status).toBeNull();
    });

    test("getPendingRecoveryStatus returns status during recovery", async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      const status = recoveryHandler.getPendingRecoveryStatus("client2", "user1");

      expect(status.lostFactor).toBe("S3");
      expect(status.verifiedFactors).toEqual([]);
      expect(status.remainingFactors).toEqual(["S1", "S2"]);
      expect(status.readyForRegeneration).toBe(false);
    });

    test("getPendingRecoveryStatus shows verified factors", async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: {},
      });

      const status = recoveryHandler.getPendingRecoveryStatus("client2", "user1");

      expect(status.verifiedFactors).toEqual(["S1"]);
      expect(status.remainingFactors).toEqual(["S2"]);
    });

    test("cancelRecovery removes pending recovery", async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      recoveryHandler.cancelRecovery("client2", "user1");

      const status = recoveryHandler.getPendingRecoveryStatus("client2", "user1");
      expect(status).toBeNull();
    });

    test("cleanupClient removes all pending recoveries for client", async () => {
      await recoveryHandler.handleLostDeviceStart({
        clientId: "client2",
        userId: "user1",
        lostFactor: "S3",
      });

      recoveryHandler.cleanupClient("client2");

      expect(recoveryHandler._pendingRecoveries.size).toBe(0);
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe("Integration Tests", () => {
    test("full recovery flow for lost TOTP device", async () => {
      // 1. User reports lost TOTP device
      const startResult = await recoveryHandler.handleLostTOTP({
        clientId: "client2",
        userId: "user1",
      });

      expect(startResult.requiredFactors).toEqual(["S1", "S2"]);

      // 2. Verify OAuth (S1)
      const verifyS1 = await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "oauth-token" },
      });

      expect(verifyS1.remainingFactors).toEqual(["S2"]);

      // 3. Verify WebAuthn (S2)
      const verifyS2 = await recoveryHandler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S2",
        verification: { assertion: "webauthn-assertion" },
      });

      expect(verifyS2.readyForRegeneration).toBe(true);

      // 4. Regenerate S3 with new TOTP secret
      const regenerateResult = await recoveryHandler.handleRegenerateShare({
        clientId: "client2",
        userId: "user1",
        newEncryptedShare: crypto.randomBytes(64).toString("base64"),
      });

      expect(regenerateResult.type).toBe(RecoveryMessageType.RECOVERY_OK);
      expect(regenerateResult.newVersion).toBe(2);

      // 5. Verify new version in ledger
      const versions = await twoOfThreeAdapter.getShareVersions("user1");
      expect(versions.S3.version).toBe(2);
    });

    test("recovery with custom verification functions", async () => {
      const verifyOAuth = jest.fn().mockResolvedValue(true);
      const verifyWebAuthn = jest.fn().mockResolvedValue(true);

      const handler = createRecoveryHandler({
        twoOfThreeAdapter,
        verifyOAuth,
        verifyWebAuthn,
      });

      // Start recovery
      await handler.handleLostTOTP({
        clientId: "client2",
        userId: "user1",
      });

      // Verify both factors
      await handler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S1",
        verification: { token: "my-oauth-token" },
      });

      await handler.handleVerifyFactor({
        clientId: "client2",
        userId: "user1",
        factor: "S2",
        verification: { assertion: "my-webauthn-assertion" },
      });

      // Check verification functions were called correctly
      expect(verifyOAuth).toHaveBeenCalledWith("user1", "my-oauth-token");
      expect(verifyWebAuthn).toHaveBeenCalledWith("user1", "my-webauthn-assertion");
    });
  });
});
