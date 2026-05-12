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

  // ============================================================================
  // Real-world scenarios that exercise default-argument branches and helpers.
  // These represent legitimate use cases an operator or library author would
  // hit in practice: omitting optional cryptography parameters, choosing a
  // non-default HMAC algorithm, encoding short secrets, etc.
  // ============================================================================
  describe("Crypto utility defaults and edge cases", () => {
    // Scenario: caller invokes _generateSecret() relying on the documented
    // default of 20 bytes (RFC 6238 recommendation). Default-arg path.
    test("generateSecret uses default 20-byte length when called without args", () => {
      const secret = adapter._generateSecret();
      // 20 bytes = 160 bits = exactly 32 base32 chars
      expect(typeof secret).toBe("string");
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBe(32);
    });

    // Scenario: short-key TOTP variants (e.g. legacy hardware tokens) generate
    // a 1-byte secret. 8 bits leaves 3 bits trailing after first base32 group,
    // exercising the "bits > 0" padding branch in base32Encode.
    test("generateSecret with 1-byte length pads trailing bits", () => {
      const secret = adapter._generateSecret(1);
      // 1 byte = 8 bits → 1 full 5-bit chunk + 3 trailing bits → 2 chars
      expect(secret.length).toBe(2);
      expect(secret).toMatch(/^[A-Z2-7]{2}$/);
    });

    // Scenario: a thin wrapper builds a code without supplying any options,
    // relying on the documented RFC 6238 defaults (6 digits, SHA1). Both the
    // outer options default and the inner destructuring defaults are exercised.
    test("generateTOTP uses RFC 6238 defaults when called without options", () => {
      const secret = adapter._generateSecret(20);
      const code = adapter._generateTOTP(secret, 12345);
      // Default digits=6 → exactly 6 digits, zero-padded
      expect(code).toMatch(/^\d{6}$/);
    });

    // Scenario: verifier called without options (defaults: digits=6, period=30,
    // window=1, algorithm=SHA1). Generates a code with matching defaults and
    // checks acceptance of the current counter.
    test("verifyTOTP uses defaults when called without options", () => {
      const secret = adapter._generateSecret(20);
      const counter = Math.floor(Date.now() / 1000 / 30);
      const code = adapter._generateTOTP(secret, counter);
      const result = adapter._verifyTOTP(secret, code);
      expect(result.valid).toBe(true);
    });

    // Scenario: an attacker submits a code with a different length than the
    // configured digit count. timingSafeEqual must reject without leaking
    // timing information about the comparison path it took.
    test("verifyTOTP rejects code with wrong length without throwing", () => {
      const secret = adapter._generateSecret(20);
      // 4-digit string instead of expected 6
      const result = adapter._verifyTOTP(secret, "1234", { digits: 6 });
      expect(result.valid).toBe(false);
    });
  });

  describe("otpauthUri with non-default algorithm/digits/period", () => {
    // Scenario: a high-security TOTP setup uses SHA-256 and 8 digits. The
    // otpauth URI builder must include those non-default parameters so the
    // authenticator app provisions itself with the matching algorithm.
    test("emits algorithm/digits/period when not equal to defaults", async () => {
      const sha256Adapter = createTOTPStrategy({
        issuer: "Bank",
        algorithm: "SHA256",
        digits: 8,
        period: 60,
      });
      sha256Adapter._defaultSecretStore.clear();
      sha256Adapter._pendingSetups.clear();
      const result = await sha256Adapter.handleSetupStart({
        clientId: "client-x",
        userId: "user-x",
        accountName: "user-x@bank.example",
      });
      expect(result.otpauthUri).toContain("algorithm=SHA256");
      expect(result.otpauthUri).toContain("digits=8");
      expect(result.otpauthUri).toContain("period=60");
    });
  });

  // ============================================================================
  // Replay-protection cleanup: after many successful verifications, the per-user
  // counter set grows; the adapter must trim it back to the latest 10 entries
  // to bound memory. This represents a long-lived TOTP user logging in many
  // times over weeks.
  // ============================================================================
  describe("Replay-counter set trimming", () => {
    test("retains only the 10 most recent counters after many verifications", async () => {
      const userId = "replay-user";
      const secret = adapter._generateSecret(20);
      // Pre-populate enabled secret directly through the in-memory store
      await new Promise((resolve, reject) => {
        const ret = adapter._defaultSecretStore.set(userId, {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });

      // Pre-fill the userCounters set with 11 counters so the next successful
      // verify pushes size to 12 → trim down to 10.
      const seeded = new Set();
      for (let i = 0; i < 11; i++) seeded.add(10_000 + i);
      adapter._usedCounters.set(userId, seeded);

      const baseCounter = Math.floor(Date.now() / 1000 / 30);
      const code = adapter._generateTOTP(secret, baseCounter);
      await adapter.handleVerify({ clientId: "c-replay", userId, code });

      const remaining = adapter._usedCounters.get(userId);
      expect(remaining.size).toBe(10);
      // The lowest seeded counters should have been trimmed
      expect(remaining.has(10_000)).toBe(false);
    });
  });

  // ============================================================================
  // External totpLib path: api-ape allows operators to inject a third-party
  // TOTP implementation (e.g. `speakeasy`, `notp`) via the `totpLib` option.
  // Both the setup-verify and the runtime verify paths must delegate to the
  // injected library when present.
  // ============================================================================
  describe("totpLib delegation", () => {
    test("handleSetupVerify delegates to totpLib.verify when configured", async () => {
      const libAdapter = createTOTPStrategy({
        issuer: "LibTest",
        totpLib: { verify: () => true },
      });
      libAdapter._defaultSecretStore.clear();
      libAdapter._pendingSetups.clear();
      const start = await libAdapter.handleSetupStart({
        clientId: "c-lib",
        userId: "lib-user",
      });
      expect(start.secret).toBeTruthy();
      const result = await libAdapter.handleSetupVerify({
        clientId: "c-lib",
        userId: "lib-user",
        code: "000000",
      });
      expect(result.type).toBe(libAdapter.MessageType.SETUP_OK);
    });

    test("handleVerify delegates to totpLib.verify when configured", async () => {
      const libAdapter = createTOTPStrategy({
        issuer: "LibTest",
        totpLib: { verify: () => true },
      });
      libAdapter._defaultSecretStore.clear();
      libAdapter._usedCounters.clear();
      await new Promise((resolve, reject) => {
        const ret = libAdapter._defaultSecretStore.set("lib-user", {
          secret: "JBSWY3DPEHPK3PXP",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const result = await libAdapter.handleVerify({
        clientId: "c-lib",
        userId: "lib-user",
        code: "999999",
      });
      expect(result.verified).toBe(true);
    });
  });

  // ============================================================================
  // The setup-expiry timer auto-cleans the pendingSetups map after the timeout
  // elapses. We use jest fake timers so we don't have to wait minutes; this
  // represents the real-world case where a user starts a TOTP enrollment, walks
  // away, and the pending entry must be garbage-collected by the auto-cleanup.
  // We also assert the no-op branch where the entry was already replaced.
  // ============================================================================
  describe("Pending-setup auto-cleanup timer", () => {
    test("removes the pending setup once setupTimeout+1000ms elapses", async () => {
      jest.useFakeTimers();
      try {
        const timerAdapter = createTOTPStrategy({
          issuer: "Timed",
          setupTimeout: 5000,
        });
        timerAdapter._defaultSecretStore.clear();
        timerAdapter._pendingSetups.clear();
        await timerAdapter.handleSetupStart({
          clientId: "c-timer",
          userId: "timer-user",
        });
        expect(timerAdapter._pendingSetups.has("timer-user")).toBe(true);
        jest.advanceTimersByTime(6001);
        expect(timerAdapter._pendingSetups.has("timer-user")).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    test("no-op when the pending setup was replaced before timer fired", async () => {
      jest.useFakeTimers();
      try {
        const timerAdapter = createTOTPStrategy({
          issuer: "Timed",
          setupTimeout: 5000,
        });
        timerAdapter._defaultSecretStore.clear();
        timerAdapter._pendingSetups.clear();
        const first = await timerAdapter.handleSetupStart({
          clientId: "c-timer-2",
          userId: "timer-user-2",
        });
        // Replace the secret (simulating a second handleSetupStart call) — the
        // first timer's branch `setup.secret === firstSecret` will be false.
        timerAdapter._pendingSetups.set("timer-user-2", {
          secret: "DIFFERENT_SECRET_VALUE",
          expiresAt: Date.now() + 999999,
        });
        jest.advanceTimersByTime(6001);
        // The second secret should still be present (first timer did not delete it)
        expect(timerAdapter._pendingSetups.get("timer-user-2").secret).toBe(
          "DIFFERENT_SECRET_VALUE",
        );
        // Reference the first secret to silence unused-var lint without changing intent
        expect(first.secret).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ============================================================================
  // Passport.js authenticate(): api-ape's TOTP strategy plugs into Passport's
  // pipeline. The strategy receives a request with code+userId on body/query
  // and must dispatch to success/fail/error on the Passport `self` context.
  // ============================================================================
  describe("Passport.js authenticate() integration", () => {
    function makePassportContext() {
      return {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
    }

    test("fails when no code is provided on the request", () => {
      const ctx = makePassportContext();
      adapter.authenticate.call(ctx, { body: {}, query: {} });
      expect(ctx.fail).toHaveBeenCalledWith(
        { message: "Missing TOTP code" },
        400,
      );
    });

    test("fails when no userId is provided on the request", () => {
      const ctx = makePassportContext();
      adapter.authenticate.call(ctx, { body: { code: "123456" }, query: {} });
      expect(ctx.fail).toHaveBeenCalledWith(
        { message: "Missing user identifier" },
        400,
      );
    });

    test("calls fail with error message when verification rejects", async () => {
      const ctx = makePassportContext();
      adapter.authenticate.call(ctx, {
        body: { code: "000000", userId: "non-enrolled-user" },
        query: {},
      });
      // Await the internal promise chain
      await new Promise((r) => setImmediate(r));
      expect(ctx.fail).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    test("calls success when verification accepts and no verify callback configured", async () => {
      const okAdapter = createTOTPStrategy({ issuer: "Pass" });
      okAdapter._defaultSecretStore.clear();
      okAdapter._usedCounters.clear();
      const secret = okAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = okAdapter._defaultSecretStore.set("pp-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = okAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      okAdapter.authenticate.call(ctx, {
        body: { code, userId: "pp-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(ctx.success).toHaveBeenCalledWith(
        { userId: "pp-user" },
        expect.objectContaining({ verified: true }),
      );
    });

    test("invokes verify callback and calls success on user", async () => {
      const verifyCb = jest.fn((info, done) => done(null, { id: info.userId, name: "Alice" }));
      const cbAdapter = createTOTPStrategy({ issuer: "WithVerify" }, verifyCb);
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("cb-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      cbAdapter.authenticate.call(ctx, {
        body: { code, userId: "cb-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(verifyCb).toHaveBeenCalled();
      expect(ctx.success).toHaveBeenCalledWith(
        { id: "cb-user", name: "Alice" },
        undefined,
      );
    });

    test("invokes verify callback with error → strategy.error()", async () => {
      const verifyCb = jest.fn((info, done) => done(new Error("DB down")));
      const cbAdapter = createTOTPStrategy({ issuer: "VErr" }, verifyCb);
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("err-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      cbAdapter.authenticate.call(ctx, {
        body: { code, userId: "err-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(ctx.error).toHaveBeenCalledWith(expect.any(Error));
    });

    test("invokes verify callback returning false user → strategy.fail()", async () => {
      const verifyCb = jest.fn((info, done) => done(null, false, { message: "user blocked" }));
      const cbAdapter = createTOTPStrategy({ issuer: "VFail" }, verifyCb);
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("block-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      cbAdapter.authenticate.call(ctx, {
        body: { code, userId: "block-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(ctx.fail).toHaveBeenCalledWith({ message: "user blocked" });
    });

    test("propagates synchronous throws from verify callback to strategy.error()", async () => {
      const verifyCb = jest.fn(() => {
        throw new Error("sync boom");
      });
      const cbAdapter = createTOTPStrategy({ issuer: "Boom" }, verifyCb);
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("boom-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      cbAdapter.authenticate.call(ctx, {
        body: { code, userId: "boom-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(ctx.error).toHaveBeenCalledWith(expect.any(Error));
    });

    // Scenario: a stored TOTP secret is minimal — just `{ secret, enabled }`
    // (e.g. migrated from a system that didn't persist algorithm/digits/period
    // metadata). The verifier's `secretData.X || adapterDefault` short-circuits
    // must fall through to the adapter-wide defaults.
    test("falls back to adapter defaults when stored secretData omits digits/period/algorithm", async () => {
      const minimalAdapter = createTOTPStrategy({ issuer: "Minimal" });
      minimalAdapter._defaultSecretStore.clear();
      minimalAdapter._usedCounters.clear();
      const secret = minimalAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = minimalAdapter._defaultSecretStore.set("min-user", {
          secret,
          enabled: true,
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = minimalAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const result = await minimalAdapter.handleVerify({
        clientId: "c-min",
        userId: "min-user",
        code,
      });
      expect(result.verified).toBe(true);
    });

    // Scenario: a previously-stored TOTP secret has its own digits/period/
    // algorithm metadata (e.g. legacy 8-digit SHA-256 tokens). The verifier
    // must prefer those over the adapter-wide defaults, exercising the LHS
    // of each `secretData.X || X` short-circuit.
    test("uses secretData-provided digits/period/algorithm overrides during verify", async () => {
      const userAdapter = createTOTPStrategy({
        issuer: "Overrides",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      });
      userAdapter._defaultSecretStore.clear();
      userAdapter._usedCounters.clear();
      const secret = userAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = userAdapter._defaultSecretStore.set("legacy-user", {
          secret,
          algorithm: "SHA256",
          digits: 8,
          period: 60,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const counter = Math.floor(Date.now() / 1000 / 60);
      const code = userAdapter._generateTOTP(secret, counter, {
        digits: 8,
        algorithm: "SHA256",
      });
      const result = await userAdapter.handleVerify({
        clientId: "c-leg",
        userId: "legacy-user",
        code,
      });
      expect(result.verified).toBe(true);
    });

    // Scenario: Passport core invokes authenticate without an authOptions arg
    // (the common case for strategies that don't take per-call options). The
    // `authOptions = {}` default-arg branch is exercised.
    test("authenticate called without authOptions falls back to default {}", () => {
      const ctx = makePassportContext();
      adapter.authenticate.call(ctx, { body: {}, query: {} });
      expect(ctx.fail).toHaveBeenCalled();
    });

    // Scenario: a stripped-down request object (lacking both `body` and
    // `query`) — e.g. a minimal HTTP req from a custom transport — is passed
    // to authenticate. Both `body = {}` and `query = {}` destructuring
    // defaults must engage so the strategy fails cleanly instead of throwing
    // on undefined property access.
    test("authenticate handles a request with no body or query (destructuring defaults)", () => {
      const ctx = makePassportContext();
      adapter.authenticate.call(ctx, {});
      expect(ctx.fail).toHaveBeenCalledWith(
        { message: "Missing TOTP code" },
        400,
      );
    });

    // Scenario: verify callback signals failure with `done(null, false)` —
    // no info object passed. The strategy must synthesise a default failure
    // message via the `info || { message: ... }` fallback.
    test("verify callback done(null, false) without info uses default failure message", async () => {
      const verifyCb = jest.fn((info, done) => done(null, false));
      const cbAdapter = createTOTPStrategy({ issuer: "NoInfo" }, verifyCb);
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("noinfo-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      cbAdapter.authenticate.call(ctx, {
        body: { code, userId: "noinfo-user" },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(ctx.fail).toHaveBeenCalledWith({ message: "Verification failed" });
    });

    test("passReqToCallback=true forwards the request to the verify callback", async () => {
      const verifyCb = jest.fn((req, info, done) => done(null, { id: info.userId }));
      const cbAdapter = createTOTPStrategy(
        { issuer: "PassReq", passReqToCallback: true },
        verifyCb,
      );
      cbAdapter._defaultSecretStore.clear();
      cbAdapter._usedCounters.clear();
      const secret = cbAdapter._generateSecret(20);
      await new Promise((resolve, reject) => {
        const ret = cbAdapter._defaultSecretStore.set("req-user", {
          secret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          enabled: true,
          enabledAt: Date.now(),
        });
        Promise.resolve(ret).then(resolve, reject);
      });
      const code = cbAdapter._generateTOTP(
        secret,
        Math.floor(Date.now() / 1000 / 30),
      );
      const ctx = makePassportContext();
      const reqObj = { body: { code, userId: "req-user" }, query: {} };
      cbAdapter.authenticate.call(ctx, reqObj);
      await new Promise((r) => setImmediate(r));
      expect(verifyCb).toHaveBeenCalledWith(
        reqObj,
        { userId: "req-user" },
        expect.any(Function),
      );
    });
  });
});
