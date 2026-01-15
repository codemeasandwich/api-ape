/**
 * @fileoverview Integration Tests for Authentication Framework
 *
 * Tests the complete MFA flow including:
 * - OPAQUE authentication (Tier 1)
 * - MFA elevation with WebAuthn (Tier 2)
 * - MFA elevation with TOTP (Tier 2)
 * - Message routing and state transitions
 */

const {
  createAuthFramework,
  isAuthMessage,
  AuthState,
  AuthTier,
  OpaqueMessageType,
  WebAuthnMessageType,
  TOTPMessageType,
  LDAPMessageType,
  createTOTPStrategy,
  createLDAPStrategy,
} = require("./index");

// Create a helper TOTP instance for generating test codes
const totpHelper = createTOTPStrategy({ issuer: "Test" });

describe("Auth Framework Integration", () => {
  let framework;

  beforeEach(() => {
    framework = createAuthFramework({
      opaque: {},
      webauthn: { rpId: "example.com", rpName: "Test App" },
      totp: { issuer: "Test App" },
      mfaMethods: ["webauthn", "totp"],
    });
  });

  describe("isAuthMessage", () => {
    test("identifies OPAQUE messages", () => {
      expect(isAuthMessage("opaque_auth_start")).toBe(true);
      expect(isAuthMessage("opaque_reg_start")).toBe(true);
    });

    test("identifies WebAuthn messages", () => {
      expect(isAuthMessage("webauthn_reg_start")).toBe(true);
      expect(isAuthMessage("webauthn_auth_start")).toBe(true);
    });

    test("identifies LDAP messages", () => {
      expect(isAuthMessage("ldap_auth")).toBe(true);
      expect(isAuthMessage("ldap_auth_ok")).toBe(true);
    });

    test("identifies TOTP messages", () => {
      expect(isAuthMessage("totp_setup_start")).toBe(true);
      expect(isAuthMessage("totp_verify")).toBe(true);
    });

    test("identifies MFA messages", () => {
      expect(isAuthMessage("mfa_challenge")).toBe(true);
      expect(isAuthMessage("mfa_verify")).toBe(true);
    });

    test("rejects non-auth messages", () => {
      expect(isAuthMessage("chat_message")).toBe(false);
      expect(isAuthMessage("user_action")).toBe(false);
      expect(isAuthMessage(null)).toBe(false);
      expect(isAuthMessage(undefined)).toBe(false);
    });
  });

  describe("Framework Initialization", () => {
    test("registers default adapters", () => {
      expect(framework.getAdapter("opaque")).toBeDefined();
      expect(framework.getAdapter("webauthn")).toBeDefined();
      expect(framework.getAdapter("totp")).toBeDefined();
    });

    test("allows registering custom adapters", () => {
      const customAdapter = { type: "custom", tier: 1 };
      framework.registerAdapter("custom", customAdapter);
      expect(framework.getAdapter("custom")).toBe(customAdapter);
    });

    test("exports message types", () => {
      expect(framework.OpaqueMessageType).toBeDefined();
      expect(framework.WebAuthnMessageType).toBeDefined();
      expect(framework.TOTPMessageType).toBeDefined();
    });

    test("exports strategy constructors", () => {
      expect(framework.createWebAuthnStrategy).toBeDefined();
      expect(framework.createTOTPStrategy).toBeDefined();
    });
  });

  describe("Socket Auth Manager", () => {
    let socketAuth;

    beforeEach(() => {
      socketAuth = framework.createSocketAuth("test-client");
    });

    afterEach(() => {
      socketAuth.cleanup();
    });

    test("creates socket auth with initial state", () => {
      const state = socketAuth.getState();
      expect(state.state).toBe(AuthState.GUEST);
      expect(state.tier).toBe(AuthTier.GUEST);
      expect(state.isAuthenticated).toBe(false);
    });

    test("isAuthenticated returns false for GUEST", () => {
      expect(socketAuth.isAuthenticated()).toBe(false);
    });

    test("meetsRequirement checks tier correctly", () => {
      expect(socketAuth.meetsRequirement(AuthTier.GUEST)).toBe(true);
      expect(socketAuth.meetsRequirement(AuthTier.BASIC)).toBe(false);
    });
  });

  describe("OPAQUE Authentication Flow (Tier 1)", () => {
    let socketAuth;

    beforeEach(() => {
      socketAuth = framework.createSocketAuth("opaque-client");
    });

    afterEach(() => {
      socketAuth.cleanup();
    });

    test("registration flow completes successfully", async () => {
      // Start registration
      const regStart = await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "newuser",
        clientNonce: "reg-nonce-1",
        regRequest: "mock-reg-request",
      });

      expect(regStart.type).toBe(OpaqueMessageType.REG_RESPONSE);
      expect(regStart.serverNonce).toBeDefined();

      // Finish registration
      const regFinish = await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "newuser",
        clientNonce: "reg-nonce-1",
        regRecord: "mock-reg-record",
      });

      expect(regFinish.type).toBe(OpaqueMessageType.REG_OK);
    });

    test("authentication flow elevates to Tier 1", async () => {
      // First register
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "authuser",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "authuser",
        clientNonce: "reg-nonce",
        regRecord: "record",
      });

      // Start auth
      const authStart = await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "authuser",
        clientNonce: "auth-nonce",
      });

      expect(authStart.type).toBe(OpaqueMessageType.AUTH_1);

      // Complete auth
      const authFinish = await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "authuser",
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      expect(authFinish.type).toBe(OpaqueMessageType.AUTH_OK);
      expect(authFinish.tier).toBe(AuthTier.BASIC);
      expect(socketAuth.isAuthenticated()).toBe(true);
      expect(socketAuth.getTier()).toBe(AuthTier.BASIC);
    });
  });

  describe("LDAP Authentication Flow (Tier 1)", () => {
    let ldapFramework;
    let ldapAdapter;

    beforeEach(async () => {
      // Create a framework with LDAP enabled
      ldapAdapter = createLDAPStrategy({
        url: "ldap://localhost:389",
        baseDN: "ou=users,dc=example,dc=com",
      });

      // Register a test user
      await ldapAdapter.registerTestUser("ldapuser", "ldappass", {
        cn: "LDAP User",
        mail: "ldapuser@example.com",
        memberOf: ["cn=developers,ou=groups,dc=example,dc=com"],
      });

      ldapFramework = createAuthFramework({
        ldap: {
          url: "ldap://localhost:389",
          baseDN: "ou=users,dc=example,dc=com",
        },
        webauthn: { rpId: "example.com", rpName: "Test App" },
        totp: { issuer: "Test App" },
      });

      // Also register user in the framework's internal LDAP adapter
      const frameworkLdap = ldapFramework.getAdapter("ldap");
      await frameworkLdap.registerTestUser("ldapuser", "ldappass", {
        cn: "LDAP User",
        mail: "ldapuser@example.com",
        memberOf: ["cn=developers,ou=groups,dc=example,dc=com"],
      });
    });

    afterEach(() => {
      ldapAdapter.cleanup();
    });

    test("LDAP authentication elevates to Tier 1", async () => {
      // User scenario: Enterprise user authenticates with LDAP credentials
      const socketAuth = ldapFramework.createSocketAuth("ldap-client");

      const result = await socketAuth.handleMessage(LDAPMessageType.AUTH, {
        username: "ldapuser",
        password: "ldappass",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.tier).toBe(AuthTier.BASIC);
      expect(result.userId).toBe("ldapuser");
      expect(result.profile.displayName).toBe("LDAP User");
      expect(result.profile.email).toBe("ldapuser@example.com");
      expect(socketAuth.isAuthenticated()).toBe(true);
      expect(socketAuth.getTier()).toBe(AuthTier.BASIC);

      socketAuth.cleanup();
    });

    test("LDAP authentication fails with wrong password", async () => {
      // User scenario: User enters wrong password
      const socketAuth = ldapFramework.createSocketAuth("ldap-fail-client");

      const result = await socketAuth.handleMessage(LDAPMessageType.AUTH, {
        username: "ldapuser",
        password: "wrongpassword",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(socketAuth.isAuthenticated()).toBe(false);

      socketAuth.cleanup();
    });

    test("LDAP authentication returns error when LDAP not configured", async () => {
      // User scenario: Client sends LDAP auth to framework without LDAP configured
      const socketAuth = framework.createSocketAuth("no-ldap-client");

      const result = await socketAuth.handleMessage(LDAPMessageType.AUTH, {
        username: "user",
        password: "pass",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(result.error).toBe("LDAP_NOT_CONFIGURED");

      socketAuth.cleanup();
    });

    test("LDAP authenticated user can setup MFA", async () => {
      // User scenario: Enterprise user authenticates via LDAP, then sets up TOTP
      const socketAuth = ldapFramework.createSocketAuth("ldap-mfa-client");

      // Authenticate via LDAP
      await socketAuth.handleMessage(LDAPMessageType.AUTH, {
        username: "ldapuser",
        password: "ldappass",
      });

      // Setup TOTP
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: "ldapuser",
      });

      expect(setupStart.type).toBe(TOTPMessageType.SETUP_CHALLENGE);
      expect(setupStart.secret).toBeDefined();

      // Generate valid TOTP code
      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(setupStart.secret, counter, { digits: 6 });

      const setupVerify = await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: "ldapuser",
        code,
      });

      expect(setupVerify.type).toBe(TOTPMessageType.SETUP_OK);

      // Verify TOTP to elevate to Tier 2
      const verifyCounter = Math.floor(Date.now() / 30000);
      const verifyCode = totpHelper._generateTOTP(setupStart.secret, verifyCounter, { digits: 6 });

      const verifyResult = await socketAuth.handleMessage(TOTPMessageType.VERIFY, {
        userId: "ldapuser",
        code: verifyCode,
      });

      expect(verifyResult.type).toBe(TOTPMessageType.OK);
      expect(verifyResult.tier).toBe(AuthTier.ELEVATED);
      expect(socketAuth.getTier()).toBe(AuthTier.ELEVATED);

      socketAuth.cleanup();
    });
  });

  describe("WebAuthn MFA Flow (Tier 2)", () => {
    let socketAuth;

    beforeEach(async () => {
      socketAuth = framework.createSocketAuth("webauthn-client");

      // Authenticate to Tier 1 first
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "webauthnuser",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "webauthnuser",
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "webauthnuser",
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "webauthnuser",
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });
    });

    afterEach(() => {
      socketAuth.cleanup();
    });

    test("WebAuthn registration flow", async () => {
      // Start WebAuthn registration
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userId: "webauthnuser",
        userName: "webauthnuser@example.com",
      });

      expect(regStart.type).toBe(WebAuthnMessageType.REG_CHALLENGE);
      expect(regStart.challenge).toBeDefined();
      expect(regStart.rp.id).toBe("example.com");

      // Finish registration
      const regFinish = await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: "webauthnuser",
        challenge: regStart.challenge,
        attestation: {
          id: "webauthn-cred-1",
          response: { publicKey: "mock-key" },
        },
      });

      expect(regFinish.type).toBe(WebAuthnMessageType.REG_OK);
    });

    test("WebAuthn authentication elevates to Tier 2", async () => {
      // Register WebAuthn credential
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userId: "webauthnuser",
        userName: "webauthnuser@example.com",
      });
      await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: "webauthnuser",
        challenge: regStart.challenge,
        attestation: { id: "cred-1" },
      });

      // Start WebAuthn auth
      const authStart = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_START, {
        userId: "webauthnuser",
      });

      expect(authStart.type).toBe(WebAuthnMessageType.AUTH_CHALLENGE);

      // Complete WebAuthn auth - should elevate to Tier 2
      const authFinish = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_FINISH, {
        userId: "webauthnuser",
        challenge: authStart.challenge,
        assertion: { id: "cred-1" },
      });

      expect(authFinish.type).toBe(WebAuthnMessageType.AUTH_OK);
      expect(authFinish.tier).toBe(AuthTier.ELEVATED);
      expect(socketAuth.getTier()).toBe(AuthTier.ELEVATED);
    });
  });

  describe("TOTP MFA Flow (Tier 2)", () => {
    let socketAuth;
    let totpSecret;
    let testUserId;

    beforeEach(async () => {
      // Use unique userId per test to avoid shared state
      testUserId = `totpuser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      socketAuth = framework.createSocketAuth(`totp-client-${testUserId}`);

      // Authenticate to Tier 1 first
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });
    });

    afterEach(() => {
      socketAuth.cleanup();
    });

    test("TOTP setup flow", async () => {
      // Start TOTP setup
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: testUserId,
        accountName: `${testUserId}@example.com`,
      });

      expect(setupStart.type).toBe(TOTPMessageType.SETUP_CHALLENGE);
      expect(setupStart.secret).toBeDefined();
      expect(setupStart.otpauthUri).toContain("otpauth://totp/");
      totpSecret = setupStart.secret;

      // Generate a valid TOTP code
      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });

      // Verify setup
      const setupVerify = await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: testUserId,
        code,
      });

      expect(setupVerify.type).toBe(TOTPMessageType.SETUP_OK);
    });

    test("TOTP verification elevates to Tier 2", async () => {
      // Setup TOTP first
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: testUserId,
      });
      expect(setupStart.type).toBe(TOTPMessageType.SETUP_CHALLENGE);
      expect(setupStart.secret).toBeDefined();
      totpSecret = setupStart.secret;

      const setupCounter = Math.floor(Date.now() / 30000);
      const setupCode = totpHelper._generateTOTP(totpSecret, setupCounter, { digits: 6 });

      await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: testUserId,
        code: setupCode,
      });

      // Verify TOTP - should elevate to Tier 2
      const verifyCounter = Math.floor(Date.now() / 30000);
      const verifyCode = totpHelper._generateTOTP(totpSecret, verifyCounter, { digits: 6 });

      const verifyResult = await socketAuth.handleMessage(TOTPMessageType.VERIFY, {
        userId: testUserId,
        code: verifyCode,
      });

      expect(verifyResult.type).toBe(TOTPMessageType.OK);
      expect(verifyResult.tier).toBe(AuthTier.ELEVATED);
      expect(socketAuth.getTier()).toBe(AuthTier.ELEVATED);
    });
  });

  describe("Generic MFA Challenge Flow", () => {
    let socketAuth;
    let totpSecret;
    let testUserId;

    beforeEach(async () => {
      // Use unique userId per test to avoid shared state
      testUserId = `mfauser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      socketAuth = framework.createSocketAuth(`mfa-client-${testUserId}`);

      // Authenticate to Tier 1 and setup TOTP
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Setup TOTP
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: testUserId,
      });
      totpSecret = setupStart.secret;

      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });

      await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: testUserId,
        code,
      });
    });

    afterEach(() => {
      socketAuth.cleanup();
    });

    test("mfa_challenge returns available methods", async () => {
      const challenge = await socketAuth.handleMessage("mfa_challenge", {});

      expect(challenge.type).toBe("mfa_challenge");
      expect(challenge.methods).toBeDefined();
      expect(challenge.methods.length).toBeGreaterThan(0);

      // Should have TOTP method since we set it up
      const totpMethod = challenge.methods.find((m) => m.method === "totp");
      expect(totpMethod).toBeDefined();
    });

    test("mfa_verify with TOTP elevates to Tier 2", async () => {
      // Request challenge first
      await socketAuth.handleMessage("mfa_challenge", {});

      // Verify with TOTP
      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });

      const result = await socketAuth.handleMessage("mfa_verify", {
        method: "totp",
        code,
      });

      expect(result.type).toBe("mfa_elevated");
      expect(result.method).toBe("totp");
      expect(result.tier).toBe(AuthTier.ELEVATED);
    });
  });

  describe("Framework Statistics", () => {
    test("getStats returns correct counts", () => {
      const socket1 = framework.createSocketAuth("stats-1");
      const socket2 = framework.createSocketAuth("stats-2");

      const stats = framework.getStats();

      expect(stats.totalSockets).toBe(2);
      expect(stats.authenticated).toBe(0);
      expect(stats.adapters).toContain("opaque");
      expect(stats.adapters).toContain("webauthn");
      expect(stats.adapters).toContain("totp");

      socket1.cleanup();
      socket2.cleanup();
    });
  });

  describe("MFA Challenge Edge Cases", () => {
    test("mfa_challenge returns fail when no MFA methods are set up for user", async () => {
      // User scenario: User logs in (Tier 1) but hasn't set up any MFA methods yet
      // When they request MFA challenge, they should get an error explaining no methods are available
      const testUserId = `nomfa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`nomfa-client-${testUserId}`);

      // Authenticate to Tier 1 (but don't set up any MFA)
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Request MFA challenge without having set up any MFA methods
      const challenge = await socketAuth.handleMessage("mfa_challenge", {});

      expect(challenge.type).toBe("mfa_challenge_fail");
      expect(challenge.error).toBe("NO_MFA_METHODS");
      expect(challenge.message).toContain("No MFA methods configured");

      socketAuth.cleanup();
    });

    test("mfa_verify with WebAuthn elevates to Tier 2", async () => {
      // User scenario: User has WebAuthn set up and uses the generic mfa_verify flow
      const testUserId = `webauthn-mfa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`webauthn-mfa-client-${testUserId}`);

      // Authenticate to Tier 1
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Register WebAuthn credential
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userId: testUserId,
        userName: `${testUserId}@example.com`,
      });
      await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: testUserId,
        challenge: regStart.challenge,
        attestation: { id: "webauthn-cred-mfa" },
      });

      // Request MFA challenge
      const challenge = await socketAuth.handleMessage("mfa_challenge", {});
      expect(challenge.type).toBe("mfa_challenge");

      // Find the WebAuthn challenge in the response
      const webauthnMethod = challenge.methods.find((m) => m.method === "webauthn");
      expect(webauthnMethod).toBeDefined();

      // Verify using generic mfa_verify with WebAuthn
      const result = await socketAuth.handleMessage("mfa_verify", {
        method: "webauthn",
        challenge: webauthnMethod.challenge.challenge,
        assertion: { id: "webauthn-cred-mfa" },
      });

      expect(result.type).toBe("mfa_elevated");
      expect(result.method).toBe("webauthn");
      expect(result.tier).toBe(AuthTier.ELEVATED);
      expect(socketAuth.getTier()).toBe(AuthTier.ELEVATED);

      socketAuth.cleanup();
    });

    test("mfa_verify with unknown method returns error", async () => {
      // User scenario: Client sends an mfa_verify with an invalid/unknown method name
      const testUserId = `unknown-mfa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`unknown-mfa-client-${testUserId}`);

      // Authenticate to Tier 1
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Try to verify with an unknown method
      const result = await socketAuth.handleMessage("mfa_verify", {
        method: "sms", // Not a supported MFA method
        code: "123456",
      });

      expect(result.type).toBe("mfa_verify_fail");
      expect(result.error).toBe("UNKNOWN_MFA_METHOD");
      expect(result.message).toContain("sms");

      socketAuth.cleanup();
    });
  });

  describe("TOTP Disable Flow", () => {
    test("TOTP can be disabled after setup", async () => {
      // User scenario: User wants to disable TOTP after having it set up
      const testUserId = `totp-disable-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`totp-disable-client-${testUserId}`);

      // Authenticate to Tier 1
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Setup TOTP
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: testUserId,
      });
      const totpSecret = setupStart.secret;

      const counter = Math.floor(Date.now() / 30000);
      const setupCode = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });

      await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: testUserId,
        code: setupCode,
      });

      // Now disable TOTP with a valid code
      const disableCounter = Math.floor(Date.now() / 30000);
      const disableCode = totpHelper._generateTOTP(totpSecret, disableCounter, { digits: 6 });

      const disableResult = await socketAuth.handleMessage(TOTPMessageType.DISABLE_START, {
        userId: testUserId,
        code: disableCode,
      });

      expect(disableResult.type).toBe(TOTPMessageType.DISABLE_OK);

      socketAuth.cleanup();
    });
  });

  describe("Unknown Auth Message", () => {
    test("unknown auth message type returns error", async () => {
      // User scenario: Client sends an auth message type that doesn't exist
      const socketAuth = framework.createSocketAuth("unknown-msg-client");

      const result = await socketAuth.handleMessage("kerberos_auth", {
        username: "user",
        ticket: "abc123",
      });

      expect(result.type).toBe("auth_error");
      expect(result.error).toBe("UNKNOWN_MESSAGE_TYPE");
      expect(result.message).toContain("kerberos_auth");

      socketAuth.cleanup();
    });
  });

  describe("Authorization", () => {
    test("authorize returns not authenticated for guest", () => {
      // User scenario: Guest tries to access a protected endpoint
      const socketAuth = framework.createSocketAuth("authz-guest-client");

      const result = socketAuth.authorize("protected/action");

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("NOT_AUTHENTICATED");
      expect(result.requiredTier).toBe(AuthTier.BASIC);
      expect(result.currentTier).toBe(AuthTier.GUEST);

      socketAuth.cleanup();
    });

    test("authorize returns allowed for authenticated user", async () => {
      // User scenario: Authenticated user accesses a protected endpoint
      const socketAuth = framework.createSocketAuth("authz-auth-client");

      // Authenticate
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "authzuser",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "authzuser",
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "authzuser",
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "authzuser",
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      const result = socketAuth.authorize("protected/action");

      expect(result.allowed).toBe(true);
      expect(result.principal).toBeDefined();
      expect(result.principal.userId).toBe("authzuser");
      expect(result.tier).toBe(AuthTier.BASIC);

      socketAuth.cleanup();
    });
  });

  describe("Framework Helpers", () => {
    test("getClientAuth returns socket state", () => {
      // User scenario: Server needs to look up auth state for a specific client
      const socketAuth = framework.createSocketAuth("lookup-client");

      const clientAuth = framework.getClientAuth("lookup-client");
      expect(clientAuth).toBeDefined();

      // Non-existent client returns null
      const missing = framework.getClientAuth("nonexistent-client");
      expect(missing).toBeNull();

      socketAuth.cleanup();
    });

    test("isAuthRequired returns configured value", () => {
      // User scenario: Server checks if auth is required for connections
      expect(framework.isAuthRequired()).toBe(false);

      const authRequiredFramework = createAuthFramework({ requireAuth: true });
      expect(authRequiredFramework.isAuthRequired()).toBe(true);
    });
  });

  describe("Callbacks", () => {
    test("onAuthSuccess is called on Tier 1 auth", async () => {
      const onAuthSuccess = jest.fn();
      const callbackFramework = createAuthFramework({ onAuthSuccess });
      const socketAuth = callbackFramework.createSocketAuth("callback-client");

      // Register and authenticate
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "callbackuser",
        clientNonce: "nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "callbackuser",
        clientNonce: "nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "callbackuser",
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "callbackuser",
        clientNonce: "auth-nonce",
        clientAuth: "proof",
      });

      expect(onAuthSuccess).toHaveBeenCalledWith(
        "callback-client",
        expect.objectContaining({ userId: "callbackuser" })
      );

      socketAuth.cleanup();
    });

    test("onMFASuccess is called on Tier 2 elevation", async () => {
      const onMFASuccess = jest.fn();
      const callbackFramework = createAuthFramework({
        webauthn: { rpId: "example.com" },
        onMFASuccess,
      });
      const socketAuth = callbackFramework.createSocketAuth("mfa-callback-client");

      // Authenticate to Tier 1
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "mfacallbackuser",
        clientNonce: "nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "mfacallbackuser",
        clientNonce: "nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "mfacallbackuser",
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "mfacallbackuser",
        clientNonce: "auth-nonce",
        clientAuth: "proof",
      });

      // Register and use WebAuthn
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userId: "mfacallbackuser",
      });
      await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: "mfacallbackuser",
        challenge: regStart.challenge,
        attestation: { id: "cred" },
      });
      const authStart = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_START, {
        userId: "mfacallbackuser",
      });
      await socketAuth.handleMessage(WebAuthnMessageType.AUTH_FINISH, {
        userId: "mfacallbackuser",
        challenge: authStart.challenge,
        assertion: { id: "cred" },
      });

      expect(onMFASuccess).toHaveBeenCalledWith(
        "mfa-callback-client",
        expect.objectContaining({ userId: "mfacallbackuser" }),
        "webauthn"
      );

      socketAuth.cleanup();
    });

    test("onAuthFailure is called when OPAQUE auth fails", async () => {
      // User scenario: User tries to authenticate but provides wrong credentials
      // The adapter throws an error, and the framework should call onAuthFailure
      const onAuthFailure = jest.fn();

      // Create a framework with a custom OPAQUE adapter that will fail auth
      const failFramework = createAuthFramework({
        opaque: {
          // The mock adapter will fail if user doesn't exist
          getUser: async () => null, // User not found
        },
        onAuthFailure,
      });
      const socketAuth = failFramework.createSocketAuth("fail-client");

      // Try to authenticate a non-existent user
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "nonexistent",
        clientNonce: "auth-nonce",
      });

      // This should fail since user doesn't exist
      const result = await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "nonexistent",
        clientNonce: "auth-nonce",
        clientAuth: "wrong-proof",
      });

      expect(result.type).toBe(OpaqueMessageType.AUTH_FAIL);
      expect(onAuthFailure).toHaveBeenCalledWith(
        "fail-client",
        expect.any(Error),
        expect.any(Object)
      );

      socketAuth.cleanup();
    });
  });

  describe("WebAuthn/TOTP Direct Usage (Without Tier 1)", () => {
    test("WebAuthn auth returns result without tier elevation when not authenticated", async () => {
      // User scenario: WebAuthn being used for primary passwordless auth
      // (not as MFA step after OPAQUE) - the result is returned as-is without tier elevation
      const socketAuth = framework.createSocketAuth("webauthn-primary-client");

      // Register WebAuthn without first doing OPAQUE auth
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userId: "passwordless-user",
        userName: "passwordless@example.com",
      });
      await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: "passwordless-user",
        challenge: regStart.challenge,
        attestation: { id: "passwordless-cred" },
      });

      // Auth with WebAuthn while still at GUEST tier
      const authStart = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_START, {
        userId: "passwordless-user",
      });
      const authFinish = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_FINISH, {
        userId: "passwordless-user",
        challenge: authStart.challenge,
        assertion: { id: "passwordless-cred" },
      });

      // Should get the basic auth result without tier elevation
      expect(authFinish.type).toBe(WebAuthnMessageType.AUTH_OK);
      // No tier property since we didn't elevate
      expect(authFinish.tier).toBeUndefined();

      socketAuth.cleanup();
    });

    test("TOTP verify returns result without tier elevation when not authenticated", async () => {
      // User scenario: TOTP being verified standalone
      // (not as MFA step after OPAQUE) - result returned as-is without tier elevation
      const testUserId = `totp-standalone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`totp-standalone-client-${testUserId}`);

      // Setup TOTP without first doing OPAQUE auth (GUEST tier)
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        userId: testUserId,
      });
      const totpSecret = setupStart.secret;

      const setupCounter = Math.floor(Date.now() / 30000);
      const setupCode = totpHelper._generateTOTP(totpSecret, setupCounter, { digits: 6 });

      await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        userId: testUserId,
        code: setupCode,
      });

      // Verify TOTP while still at GUEST tier
      const verifyCounter = Math.floor(Date.now() / 30000);
      const verifyCode = totpHelper._generateTOTP(totpSecret, verifyCounter, { digits: 6 });

      const verifyResult = await socketAuth.handleMessage(TOTPMessageType.VERIFY, {
        userId: testUserId,
        code: verifyCode,
      });

      // Should get basic OK result without tier elevation
      expect(verifyResult.type).toBe(TOTPMessageType.OK);
      // No tier property since we didn't elevate (not at BASIC tier)
      expect(verifyResult.tier).toBeUndefined();

      socketAuth.cleanup();
    });
  });

  describe("UserId From Principal (Fallback Paths)", () => {
    test("WebAuthn uses userId from principal when not provided in data", async () => {
      // User scenario: Authenticated user sets up WebAuthn without explicitly passing userId
      // The framework should fall back to state.principal.userId
      const socketAuth = framework.createSocketAuth("principal-webauthn-client");

      // Authenticate to Tier 1 first
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: "principal-user",
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "principal-user",
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "principal-user",
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "principal-user",
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Register WebAuthn WITHOUT providing userId - should use principal.userId
      const regStart = await socketAuth.handleMessage(WebAuthnMessageType.REG_START, {
        userName: "principal-user@example.com",
        // no userId provided - should fall back to principal
      });
      expect(regStart.type).toBe(WebAuthnMessageType.REG_CHALLENGE);

      // Finish registration without explicit userId
      const regFinish = await socketAuth.handleMessage(WebAuthnMessageType.REG_FINISH, {
        challenge: regStart.challenge,
        attestation: { id: "principal-cred" },
      });
      expect(regFinish.type).toBe(WebAuthnMessageType.REG_OK);

      // Start auth without explicit userId
      const authStart = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_START, {});
      expect(authStart.type).toBe(WebAuthnMessageType.AUTH_CHALLENGE);

      // Finish auth without explicit userId
      const authFinish = await socketAuth.handleMessage(WebAuthnMessageType.AUTH_FINISH, {
        challenge: authStart.challenge,
        assertion: { id: "principal-cred" },
      });
      expect(authFinish.type).toBe(WebAuthnMessageType.AUTH_OK);
      expect(authFinish.tier).toBe(AuthTier.ELEVATED);

      socketAuth.cleanup();
    });

    test("TOTP uses userId from principal when not provided in data", async () => {
      // User scenario: Authenticated user sets up TOTP without explicitly passing userId
      const testUserId = `principal-totp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`principal-totp-client-${testUserId}`);

      // Authenticate to Tier 1 first
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      // Setup TOTP WITHOUT providing userId - should use principal.userId
      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {
        // no userId provided - should fall back to principal
      });
      expect(setupStart.type).toBe(TOTPMessageType.SETUP_CHALLENGE);
      const totpSecret = setupStart.secret;

      // Verify setup without explicit userId
      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });

      const setupVerify = await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, {
        code,
        // no userId
      });
      expect(setupVerify.type).toBe(TOTPMessageType.SETUP_OK);

      // Verify TOTP without explicit userId
      const verifyCounter = Math.floor(Date.now() / 30000);
      const verifyCode = totpHelper._generateTOTP(totpSecret, verifyCounter, { digits: 6 });

      const verifyResult = await socketAuth.handleMessage(TOTPMessageType.VERIFY, {
        code: verifyCode,
        // no userId
      });
      expect(verifyResult.type).toBe(TOTPMessageType.OK);
      expect(verifyResult.tier).toBe(AuthTier.ELEVATED);

      socketAuth.cleanup();
    });

    test("TOTP disable uses userId from principal when not provided", async () => {
      // User scenario: User disables TOTP without explicitly passing userId
      const testUserId = `disable-principal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const socketAuth = framework.createSocketAuth(`disable-principal-client-${testUserId}`);

      // Authenticate and setup TOTP
      await socketAuth.handleMessage(OpaqueMessageType.REG_START, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRequest: "req",
      });
      await socketAuth.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: testUserId,
        clientNonce: "reg-nonce",
        regRecord: "record",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_START, {
        user: testUserId,
        clientNonce: "auth-nonce",
      });
      await socketAuth.handleMessage(OpaqueMessageType.AUTH_2, {
        user: testUserId,
        clientNonce: "auth-nonce",
        clientAuth: "mock-proof",
      });

      const setupStart = await socketAuth.handleMessage(TOTPMessageType.SETUP_START, {});
      const totpSecret = setupStart.secret;
      const counter = Math.floor(Date.now() / 30000);
      const code = totpHelper._generateTOTP(totpSecret, counter, { digits: 6 });
      await socketAuth.handleMessage(TOTPMessageType.SETUP_VERIFY, { code });

      // Disable without explicit userId
      const disableCounter = Math.floor(Date.now() / 30000);
      const disableCode = totpHelper._generateTOTP(totpSecret, disableCounter, { digits: 6 });

      const disableResult = await socketAuth.handleMessage(TOTPMessageType.DISABLE_START, {
        code: disableCode,
        // no userId - should fall back to principal
      });
      expect(disableResult.type).toBe(TOTPMessageType.DISABLE_OK);

      socketAuth.cleanup();
    });
  });

  describe("Framework Statistics Edge Cases", () => {
    test("getStats counts authenticated and elevated sockets", async () => {
      // User scenario: Admin wants to see how many users are at each tier
      const socket1 = framework.createSocketAuth("stats-guest");
      const socket2 = framework.createSocketAuth("stats-auth");
      const socket3 = framework.createSocketAuth("stats-elevated");

      // socket2: authenticate to Tier 1
      await socket2.handleMessage(OpaqueMessageType.REG_START, {
        user: "statsuser2",
        clientNonce: "nonce",
        regRequest: "req",
      });
      await socket2.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "statsuser2",
        clientNonce: "nonce",
        regRecord: "record",
      });
      await socket2.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "statsuser2",
        clientNonce: "auth-nonce",
      });
      await socket2.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "statsuser2",
        clientNonce: "auth-nonce",
        clientAuth: "proof",
      });

      // socket3: authenticate and elevate to Tier 2
      await socket3.handleMessage(OpaqueMessageType.REG_START, {
        user: "statsuser3",
        clientNonce: "nonce",
        regRequest: "req",
      });
      await socket3.handleMessage(OpaqueMessageType.REG_FINISH, {
        user: "statsuser3",
        clientNonce: "nonce",
        regRecord: "record",
      });
      await socket3.handleMessage(OpaqueMessageType.AUTH_START, {
        user: "statsuser3",
        clientNonce: "auth-nonce",
      });
      await socket3.handleMessage(OpaqueMessageType.AUTH_2, {
        user: "statsuser3",
        clientNonce: "auth-nonce",
        clientAuth: "proof",
      });

      // Setup and use WebAuthn for socket3
      const regStart = await socket3.handleMessage(WebAuthnMessageType.REG_START, {
        userId: "statsuser3",
      });
      await socket3.handleMessage(WebAuthnMessageType.REG_FINISH, {
        userId: "statsuser3",
        challenge: regStart.challenge,
        attestation: { id: "stats-cred" },
      });
      const authStart = await socket3.handleMessage(WebAuthnMessageType.AUTH_START, {
        userId: "statsuser3",
      });
      await socket3.handleMessage(WebAuthnMessageType.AUTH_FINISH, {
        userId: "statsuser3",
        challenge: authStart.challenge,
        assertion: { id: "stats-cred" },
      });

      const stats = framework.getStats();

      expect(stats.totalSockets).toBe(3);
      expect(stats.authenticated).toBe(2); // socket2 + socket3
      expect(stats.elevated).toBe(1); // socket3 only

      socket1.cleanup();
      socket2.cleanup();
      socket3.cleanup();
    });
  });
});
