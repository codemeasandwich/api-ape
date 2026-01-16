/**
 * @fileoverview Integration tests for SAML Authentication Adapter
 *
 * Tests the SAML adapter through its public interface following the
 * "test functionality not functions" philosophy.
 */

const { createSAMLStrategy, SAMLMessageType, SAMLError, SAMLStrategy } = require("./saml");

describe("SAML Authentication Adapter", () => {
  let saml;

  beforeEach(() => {
    saml = createSAMLStrategy({
      entryPoint: "https://idp.example.com/sso",
      issuer: "my-app",
      callbackUrl: "https://myapp.com/auth/saml/callback",
    });
  });

  afterEach(() => {
    saml.cleanup();
  });

  describe("User Registration (Mock Mode)", () => {
    test("can register a test user for mock authentication", async () => {
      // User scenario: Developer sets up test user in mock mode
      const registered = await saml.registerTestUser("user@example.com", {
        firstName: "Test",
        lastName: "User",
        displayName: "Test User",
        email: "user@example.com",
        groups: ["developers", "employees"],
      });

      expect(registered).toBe(true);
    });
  });

  describe("Auth Start (SP-Initiated SSO)", () => {
    test("generates redirect URL for IdP", async () => {
      // User scenario: User clicks "Login with SSO" button
      const result = await saml.handleAuthStart({});

      expect(result.type).toBe(SAMLMessageType.AUTH_REDIRECT);
      expect(result.url).toContain("https://idp.example.com/sso");
      expect(result.url).toContain("SAMLRequest=");
      expect(result.requestId).toBeDefined();
      expect(result.requestId).toMatch(/^_[a-f0-9]+$/);
    });

    test("includes relay state in redirect URL", async () => {
      // User scenario: Preserve original URL after SSO redirect
      const result = await saml.handleAuthStart({
        relayState: "/dashboard?tab=settings",
      });

      expect(result.type).toBe(SAMLMessageType.AUTH_REDIRECT);
      expect(result.url).toContain("RelayState=");
      expect(result.url).toContain(encodeURIComponent("/dashboard?tab=settings"));
    });
  });

  describe("Auth Callback", () => {
    test("successful callback returns user profile", async () => {
      // User scenario: IdP redirects back with valid SAML response
      await saml.registerTestUser("john@corp.example.com", {
        firstName: "John",
        lastName: "Doe",
        displayName: "John Doe",
        email: "john@corp.example.com",
        groups: ["engineering", "admins"],
      });

      const result = await saml.handleAuthCallback({
        SAMLResponse: "john@corp.example.com", // Mock: nameId directly
        RelayState: "/dashboard",
      });

      expect(result.type).toBe(SAMLMessageType.AUTH_OK);
      expect(result.userId).toBe("john@corp.example.com");
      expect(result.profile).toBeDefined();
      expect(result.profile.nameID).toBe("john@corp.example.com");
      expect(result.profile.email).toBe("john@corp.example.com");
      expect(result.profile.firstName).toBe("John");
      expect(result.profile.lastName).toBe("Doe");
      expect(result.profile.displayName).toBe("John Doe");
      expect(result.profile.groups).toContain("engineering");
      expect(result.relayState).toBe("/dashboard");
    });

    test("callback fails with missing SAML response", async () => {
      // User scenario: Callback without response (browser issue or attack)
      const result = await saml.handleAuthCallback({});

      expect(result.type).toBe(SAMLMessageType.AUTH_FAIL);
      expect(result.error).toBe(SAMLError.MISSING_ASSERTION);
    });

    test("callback fails with unknown user", async () => {
      // User scenario: User not provisioned in IdP or app
      const result = await saml.handleAuthCallback({
        SAMLResponse: "unknown@example.com",
      });

      expect(result.type).toBe(SAMLMessageType.AUTH_FAIL);
      expect(result.error).toBe(SAMLError.MISSING_NAMEID);
    });
  });

  describe("Logout", () => {
    test("logout without SLO configured returns success", async () => {
      // User scenario: App doesn't support single logout
      const result = await saml.handleLogoutStart({
        nameId: "user@example.com",
      });

      expect(result.type).toBe(SAMLMessageType.LOGOUT_OK);
    });

    test("logout with SLO configured returns redirect", async () => {
      // User scenario: Enterprise app with single logout
      const samlWithSLO = createSAMLStrategy({
        entryPoint: "https://idp.example.com/sso",
        issuer: "my-app",
        logoutUrl: "https://idp.example.com/slo",
      });

      const result = await samlWithSLO.handleLogoutStart({
        nameId: "user@example.com",
        sessionIndex: "session123",
      });

      expect(result.type).toBe(SAMLMessageType.LOGOUT_REDIRECT);
      expect(result.url).toContain("https://idp.example.com/slo");
      expect(result.url).toContain("NameID=");
      expect(result.url).toContain("SessionIndex=");

      samlWithSLO.cleanup();
    });
  });

  describe("Passport.js Strategy Interface", () => {
    test("authenticate initiates SSO when no SAMLResponse", async () => {
      // User scenario: Passport calls authenticate to start SSO
      const mockReq = {};

      const redirectPromise = new Promise((resolve) => {
        const context = {
          redirect: (url) => resolve({ redirect: true, url }),
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: (err) => resolve({ error: true, err }),
        };
        saml.authenticate.call(context, mockReq);
      });

      const result = await redirectPromise;
      expect(result.redirect).toBe(true);
      expect(result.url).toContain("https://idp.example.com/sso");
    });

    test("authenticate handles callback with SAMLResponse", async () => {
      // User scenario: Passport handles callback from IdP
      await saml.registerTestUser("sso@example.com", {
        firstName: "SSO",
        lastName: "User",
        email: "sso@example.com",
      });

      const mockReq = {
        body: {
          SAMLResponse: "sso@example.com",
          RelayState: "/home",
        },
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: (url) => resolve({ redirect: true, url }),
          success: (user, info) => resolve({ success: true, user, info }),
          fail: (info) => reject(new Error(info?.message || "Auth failed")),
          error: (err) => reject(err),
        };
        saml.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.nameID).toBe("sso@example.com");
      expect(result.info.userId).toBe("sso@example.com");
    });

    test("authenticate with verify callback", async () => {
      // User scenario: Custom verify to enrich user profile
      const samlWithVerify = createSAMLStrategy(
        {
          entryPoint: "https://idp.example.com/sso",
          issuer: "my-app",
        },
        (profile, done) => {
          // Transform SAML profile to app user
          done(null, {
            id: profile.nameID,
            email: profile.email,
            roles: profile.groups,
          });
        }
      );

      await samlWithVerify.registerTestUser("verify@example.com", {
        email: "verify@example.com",
        groups: ["admin"],
      });

      const mockReq = {
        SAMLResponse: "verify@example.com",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: (user) => resolve({ success: true, user }),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        samlWithVerify.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.id).toBe("verify@example.com");
      expect(result.user.roles).toContain("admin");

      samlWithVerify.cleanup();
    });

    test("authenticate calls fail on unknown user", async () => {
      // User scenario: User not found in IdP
      const mockReq = {
        body: {
          SAMLResponse: "unknown@example.com",
        },
      };

      const failPromise = new Promise((resolve) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: () => resolve({ error: true }),
        };
        saml.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.info.code).toBe(SAMLError.MISSING_NAMEID);
    });

    test("authenticate with passReqToCallback option", async () => {
      // User scenario: Verify callback needs request info (IP, headers)
      const samlWithReq = createSAMLStrategy(
        {
          entryPoint: "https://idp.example.com/sso",
          issuer: "my-app",
          passReqToCallback: true,
        },
        (req, profile, done) => {
          done(null, {
            id: profile.nameID,
            loginIP: req.clientIP,
          });
        }
      );

      await samlWithReq.registerTestUser("requser@example.com", {
        email: "requser@example.com",
      });

      const mockReq = {
        SAMLResponse: "requser@example.com",
        clientIP: "10.0.0.1",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: (user) => resolve({ success: true, user }),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        samlWithReq.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.id).toBe("requser@example.com");
      expect(result.user.loginIP).toBe("10.0.0.1");

      samlWithReq.cleanup();
    });

    test("authenticate with verify callback that rejects", async () => {
      // User scenario: Verify callback rejects user (e.g., not in allowed org)
      const samlWithReject = createSAMLStrategy(
        {
          entryPoint: "https://idp.example.com/sso",
          issuer: "my-app",
        },
        (profile, done) => {
          done(null, false, { message: "Organization not allowed" });
        }
      );

      await samlWithReject.registerTestUser("reject@example.com", {});

      const mockReq = {
        SAMLResponse: "reject@example.com",
      };

      const failPromise = new Promise((resolve) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: () => resolve({ error: true }),
        };
        samlWithReject.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.info.message).toBe("Organization not allowed");

      samlWithReject.cleanup();
    });
  });

  describe("Strategy Aliasing", () => {
    test("SAMLStrategy is an alias for createSAMLStrategy", () => {
      // User scenario: Developer uses Passport.js style import
      expect(SAMLStrategy).toBe(createSAMLStrategy);

      const strategy = SAMLStrategy();
      expect(strategy.name).toBe("saml");
      expect(typeof strategy.authenticate).toBe("function");
      strategy.cleanup();
    });
  });

  describe("Configuration Access", () => {
    test("exposes configuration for framework integration", () => {
      // User scenario: Framework needs to inspect adapter config
      const customSaml = createSAMLStrategy({
        entryPoint: "https://sso.corp.com/saml",
        issuer: "corp-app",
        callbackUrl: "https://app.corp.com/saml/acs",
      });

      expect(customSaml._config.entryPoint).toBe("https://sso.corp.com/saml");
      expect(customSaml._config.issuer).toBe("corp-app");
      expect(customSaml._config.callbackUrl).toBe("https://app.corp.com/saml/acs");

      customSaml.cleanup();
    });
  });

  describe("Multiple Independent Instances", () => {
    test("multiple SAML instances are isolated", async () => {
      // User scenario: App connects to multiple IdPs
      const saml1 = createSAMLStrategy({ entryPoint: "https://idp1.example.com" });
      const saml2 = createSAMLStrategy({ entryPoint: "https://idp2.example.com" });

      await saml1.registerTestUser("user1@idp1.com", { email: "user1@idp1.com" });
      await saml2.registerTestUser("user2@idp2.com", { email: "user2@idp2.com" });

      // User1 should only exist in saml1
      const result1 = await saml1.handleAuthCallback({ SAMLResponse: "user1@idp1.com" });
      expect(result1.type).toBe(SAMLMessageType.AUTH_OK);

      const result1in2 = await saml2.handleAuthCallback({ SAMLResponse: "user1@idp1.com" });
      expect(result1in2.type).toBe(SAMLMessageType.AUTH_FAIL);

      // User2 should only exist in saml2
      const result2 = await saml2.handleAuthCallback({ SAMLResponse: "user2@idp2.com" });
      expect(result2.type).toBe(SAMLMessageType.AUTH_OK);

      saml1.cleanup();
      saml2.cleanup();
    });
  });

  describe("Full SSO Flow Simulation", () => {
    test("complete SP-initiated SSO flow", async () => {
      // User scenario: Full SSO flow from start to finish
      // 1. Register user at "IdP"
      await saml.registerTestUser("employee@company.com", {
        firstName: "Employee",
        lastName: "Name",
        displayName: "Employee Name",
        email: "employee@company.com",
        groups: ["engineering", "full-time"],
      });

      // 2. Initiate SSO
      const authStart = await saml.handleAuthStart({
        relayState: "/projects/new",
      });

      expect(authStart.type).toBe(SAMLMessageType.AUTH_REDIRECT);
      expect(authStart.requestId).toBeDefined();

      // 3. Simulate user authenticating at IdP and callback
      const authCallback = await saml.handleAuthCallback({
        SAMLResponse: "employee@company.com",
        RelayState: "/projects/new",
      });

      expect(authCallback.type).toBe(SAMLMessageType.AUTH_OK);
      expect(authCallback.userId).toBe("employee@company.com");
      expect(authCallback.profile.displayName).toBe("Employee Name");
      expect(authCallback.profile.groups).toContain("engineering");
      expect(authCallback.relayState).toBe("/projects/new");
    });
  });
});
