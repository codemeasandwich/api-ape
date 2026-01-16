/**
 * @fileoverview Tests for TOTP Authentication Adapter
 */

const {
  createTOTPStrategy,
  Strategy,
  TOTPMessageType,
  TOTPError,
} = require("./totp");

describe("TOTP Adapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = createTOTPStrategy({
      issuer: "TestApp",
    });
    // Clear stores between tests
    adapter._defaultSecretStore.clear();
    adapter._pendingSetups.clear();
    adapter._usedCounters.clear();
  });

  describe("Strategy Interface", () => {
    test("exports Strategy alias", () => {
      expect(Strategy).toBe(createTOTPStrategy);
    });

    test("has Passport.js required properties", () => {
      expect(adapter.name).toBe("totp");
      expect(typeof adapter.authenticate).toBe("function");
    });

    test("has api-ape adapter properties", () => {
      expect(adapter.type).toBe("totp");
      expect(adapter.tier).toBe(2);
    });

    test("accepts Passport.js style (verify) constructor", () => {
      const verifyFn = jest.fn();
      const strategy = createTOTPStrategy(verifyFn);
      expect(strategy.name).toBe("totp");
    });

    test("accepts Passport.js style (options, verify) constructor", () => {
      const verifyFn = jest.fn();
      const strategy = createTOTPStrategy({ issuer: "Test" }, verifyFn);
      expect(strategy.name).toBe("totp");
    });
  });

  describe("TOTP Crypto Functions", () => {
    test("generates base32 secret of correct length", () => {
      const secret = adapter._generateSecret(20);
      // 20 bytes = 160 bits = 32 base32 chars
      expect(secret.length).toBe(32);
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    test("generates valid TOTP codes", () => {
      const secret = adapter._generateSecret(20);
      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(secret, counter, { digits: 6 });

      expect(code).toMatch(/^\d{6}$/);
    });

    test("verifies correct TOTP code", () => {
      const secret = adapter._generateSecret(20);
      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(secret, counter, { digits: 6 });

      const result = adapter._verifyTOTP(secret, code, {
        digits: 6,
        period: 30,
        window: 1,
      });

      expect(result.valid).toBe(true);
    });

    test("rejects incorrect TOTP code", () => {
      const secret = adapter._generateSecret(20);

      const result = adapter._verifyTOTP(secret, "000000", {
        digits: 6,
        period: 30,
        window: 0,
      });

      expect(result.valid).toBe(false);
    });

    test("accepts code within time window", () => {
      const secret = adapter._generateSecret(20);
      const currentCounter = Math.floor(Date.now() / 30000);

      // Generate code for previous time step
      const prevCode = adapter._generateTOTP(secret, currentCounter - 1, {
        digits: 6,
      });

      const result = adapter._verifyTOTP(secret, prevCode, {
        digits: 6,
        period: 30,
        window: 1, // Allow 1 step before/after
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Setup Flow", () => {
    test("handleSetupStart returns challenge with secret", async () => {
      const result = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "alice",
        accountName: "alice@example.com",
      });

      expect(result.type).toBe(TOTPMessageType.SETUP_CHALLENGE);
      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBe(32);
      expect(result.otpauthUri).toContain("otpauth://totp/");
      expect(result.otpauthUri).toContain("TestApp");
      expect(result.otpauthUri).toContain("alice%40example.com");
    });

    test("handleSetupStart rejects if TOTP already enabled", async () => {
      // Enable TOTP first
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "bob",
      });

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(setup.secret, counter, { digits: 6 });

      await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "bob",
        code,
      });

      // Try to setup again
      await expect(
        adapter.handleSetupStart({
          clientId: "test-client",
          userId: "bob",
        })
      ).rejects.toMatchObject({ code: TOTPError.ALREADY_ENABLED });
    });

    test("handleSetupVerify enables TOTP with valid code", async () => {
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "charlie",
      });

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(setup.secret, counter, { digits: 6 });

      const result = await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "charlie",
        code,
      });

      expect(result.type).toBe(TOTPMessageType.SETUP_OK);

      // Verify TOTP is now enabled
      expect(await adapter.isEnabled("charlie")).toBe(true);
    });

    test("handleSetupVerify rejects invalid code", async () => {
      await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "david",
      });

      await expect(
        adapter.handleSetupVerify({
          clientId: "test-client",
          userId: "david",
          code: "000000",
        })
      ).rejects.toMatchObject({ code: TOTPError.INVALID_CODE });
    });

    test("handleSetupVerify rejects expired setup", async () => {
      const fastAdapter = createTOTPStrategy({
        issuer: "Test",
        setupTimeout: 1, // 1ms timeout
      });

      const setup = await fastAdapter.handleSetupStart({
        clientId: "test-client",
        userId: "eve",
      });

      // Wait for setup to expire
      await new Promise((r) => setTimeout(r, 10));

      const counter = Math.floor(Date.now() / 30000);
      const code = fastAdapter._generateTOTP(setup.secret, counter, {
        digits: 6,
      });

      await expect(
        fastAdapter.handleSetupVerify({
          clientId: "test-client",
          userId: "eve",
          code,
        })
      ).rejects.toMatchObject({ code: TOTPError.SETUP_EXPIRED });
    });

    test("handleSetupVerify rejects without pending setup", async () => {
      await expect(
        adapter.handleSetupVerify({
          clientId: "test-client",
          userId: "unknown",
          code: "123456",
        })
      ).rejects.toMatchObject({ code: TOTPError.SETUP_EXPIRED });
    });
  });

  describe("Verification Flow", () => {
    let userSecret;

    beforeEach(async () => {
      // Setup TOTP for test user
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "testuser",
      });
      userSecret = setup.secret;

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "testuser",
        code,
      });
    });

    test("handleVerify accepts valid code", async () => {
      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      const result = await adapter.handleVerify({
        clientId: "verify-client",
        userId: "testuser",
        code,
      });

      expect(result.type).toBe(TOTPMessageType.OK);
      expect(result.method).toBe("totp");
      expect(result.verified).toBe(true);
    });

    test("handleVerify rejects invalid code", async () => {
      await expect(
        adapter.handleVerify({
          clientId: "verify-client",
          userId: "testuser",
          code: "000000",
        })
      ).rejects.toMatchObject({ code: TOTPError.INVALID_CODE });
    });

    test("handleVerify rejects missing code", async () => {
      await expect(
        adapter.handleVerify({
          clientId: "verify-client",
          userId: "testuser",
          code: "",
        })
      ).rejects.toMatchObject({ code: TOTPError.MISSING_CODE });
    });

    test("handleVerify rejects user without TOTP enabled", async () => {
      await expect(
        adapter.handleVerify({
          clientId: "verify-client",
          userId: "no-totp-user",
          code: "123456",
        })
      ).rejects.toMatchObject({ code: TOTPError.NOT_ENABLED });
    });

    test("handleVerify prevents replay attacks", async () => {
      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      // First verification should succeed
      await adapter.handleVerify({
        clientId: "verify-client",
        userId: "testuser",
        code,
      });

      // Same code should be rejected (replay attack)
      await expect(
        adapter.handleVerify({
          clientId: "verify-client",
          userId: "testuser",
          code,
        })
      ).rejects.toMatchObject({ code: TOTPError.CODE_REUSED });
    });
  });

  describe("Disable Flow", () => {
    let userSecret;

    beforeEach(async () => {
      // Setup TOTP for test user
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "disableuser",
      });
      userSecret = setup.secret;

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "disableuser",
        code,
      });
    });

    test("handleDisable removes TOTP with valid code", async () => {
      expect(await adapter.isEnabled("disableuser")).toBe(true);

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      const result = await adapter.handleDisable({
        clientId: "test-client",
        userId: "disableuser",
        code,
      });

      expect(result.type).toBe(TOTPMessageType.DISABLE_OK);
      expect(await adapter.isEnabled("disableuser")).toBe(false);
    });

    test("handleDisable rejects invalid code", async () => {
      await expect(
        adapter.handleDisable({
          clientId: "test-client",
          userId: "disableuser",
          code: "000000",
        })
      ).rejects.toMatchObject({ code: TOTPError.INVALID_CODE });

      // TOTP should still be enabled
      expect(await adapter.isEnabled("disableuser")).toBe(true);
    });
  });

  describe("Passport.js authenticate()", () => {
    let userSecret;

    beforeEach(async () => {
      // Setup TOTP
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "passportuser",
      });
      userSecret = setup.secret;

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "passportuser",
        code,
      });
    });

    test("calls this.fail() when code missing", (done) => {
      const req = { body: { userId: "passportuser" }, query: {} };

      adapter.authenticate.call(
        {
          fail: (info, status) => {
            expect(info.message).toBe("Missing TOTP code");
            expect(status).toBe(400);
            done();
          },
          success: () => done(new Error("Should not succeed")),
          error: () => done(new Error("Should not error")),
        },
        req
      );
    });

    test("calls this.fail() when userId missing", (done) => {
      const req = { body: { code: "123456" }, query: {} };

      adapter.authenticate.call(
        {
          fail: (info, status) => {
            expect(info.message).toBe("Missing user identifier");
            expect(status).toBe(400);
            done();
          },
          success: () => done(new Error("Should not succeed")),
          error: () => done(new Error("Should not error")),
        },
        req
      );
    });

    test("calls this.success() on valid code", async () => {
      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(userSecret, counter, { digits: 6 });

      const req = {
        clientId: "passport-client",
        body: { userId: "passportuser", code },
        query: {},
      };

      await new Promise((resolve, reject) => {
        adapter.authenticate.call(
          {
            success: (user, info) => {
              expect(user.userId).toBe("passportuser");
              resolve();
            },
            fail: (info) => reject(new Error(`Unexpected fail: ${info.message}`)),
            error: (err) => reject(err),
          },
          req
        );
      });
    });

    test("calls verify callback when provided", async () => {
      const verifyFn = jest.fn((user, done) => {
        done(null, { ...user, verified: true });
      });

      const verifyAdapter = createTOTPStrategy({ issuer: "Test" }, verifyFn);

      // Setup TOTP
      const setup = await verifyAdapter.handleSetupStart({
        clientId: "test-client",
        userId: "verifyuser",
      });

      const setupCounter = Math.floor(Date.now() / 30000);
      const setupCode = verifyAdapter._generateTOTP(setup.secret, setupCounter, {
        digits: 6,
      });

      await verifyAdapter.handleSetupVerify({
        clientId: "test-client",
        userId: "verifyuser",
        code: setupCode,
      });

      // Authenticate
      const counter = Math.floor(Date.now() / 30000);
      const code = verifyAdapter._generateTOTP(setup.secret, counter, {
        digits: 6,
      });

      const req = {
        clientId: "verify-client",
        body: { userId: "verifyuser", code },
        query: {},
      };

      await new Promise((resolve, reject) => {
        verifyAdapter.authenticate.call(
          {
            success: (user, info) => {
              expect(verifyFn).toHaveBeenCalled();
              expect(user.verified).toBe(true);
              resolve();
            },
            fail: (info) => reject(new Error(`Unexpected fail: ${info.message}`)),
            error: (err) => reject(err),
          },
          req
        );
      });
    });
  });

  describe("Utility Methods", () => {
    test("isEnabled returns false for unknown user", async () => {
      expect(await adapter.isEnabled("unknown")).toBe(false);
    });

    test("isEnabled returns true after setup", async () => {
      const setup = await adapter.handleSetupStart({
        clientId: "test-client",
        userId: "enableduser",
      });

      const counter = Math.floor(Date.now() / 30000);
      const code = adapter._generateTOTP(setup.secret, counter, { digits: 6 });

      await adapter.handleSetupVerify({
        clientId: "test-client",
        userId: "enableduser",
        code,
      });

      expect(await adapter.isEnabled("enableduser")).toBe(true);
    });

    test("hasTOTPLib returns false when no lib configured", () => {
      expect(adapter.hasTOTPLib()).toBe(false);
    });

    test("hasTOTPLib returns true when lib is provided", () => {
      const adapterWithLib = createTOTPStrategy({
        totpLib: { verify: () => {} },
      });
      expect(adapterWithLib.hasTOTPLib()).toBe(true);
    });

    test("cleanupClient does not throw", () => {
      expect(() => adapter.cleanupClient("some-client")).not.toThrow();
    });
  });

  describe("Configuration Options", () => {
    test("uses custom issuer in otpauth URI", async () => {
      const customAdapter = createTOTPStrategy({
        issuer: "CustomIssuer",
      });

      const result = await customAdapter.handleSetupStart({
        clientId: "test-client",
        userId: "user1",
      });

      expect(result.otpauthUri).toContain("CustomIssuer");
    });

    test("uses custom digits setting", async () => {
      const customAdapter = createTOTPStrategy({
        issuer: "Test",
        digits: 8,
      });

      const result = await customAdapter.handleSetupStart({
        clientId: "test-client",
        userId: "user1",
      });

      expect(result.digits).toBe(8);
      expect(result.otpauthUri).toContain("digits=8");
    });

    test("uses custom period setting", async () => {
      const customAdapter = createTOTPStrategy({
        issuer: "Test",
        period: 60,
      });

      const result = await customAdapter.handleSetupStart({
        clientId: "test-client",
        userId: "user1",
      });

      expect(result.period).toBe(60);
      expect(result.otpauthUri).toContain("period=60");
    });
  });
});
