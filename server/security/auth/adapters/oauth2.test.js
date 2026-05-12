/**
 * @fileoverview Integration tests for OAuth2 Authentication Adapter
 *
 * Tests the OAuth2 adapter through its public interface following the
 * "test functionality not functions" philosophy.
 */

const { createOAuth2Strategy, OAuth2MessageType, OAuth2Error, OAuth2Strategy } = require("./oauth2");

describe("OAuth2 Authentication Adapter", () => {
  let oauth2;

  beforeEach(() => {
    oauth2 = createOAuth2Strategy({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      authorizationURL: "https://provider.example.com/oauth2/authorize",
      tokenURL: "https://provider.example.com/oauth2/token",
      userProfileURL: "https://provider.example.com/oauth2/userinfo",
      callbackURL: "https://myapp.com/auth/callback",
      scope: ["openid", "profile", "email"],
    });
  });

  afterEach(() => {
    oauth2.cleanup();
  });

  describe("User Registration (Mock Mode)", () => {
    test("can register a test user for mock authentication", async () => {
      // User scenario: Developer sets up test user in mock mode
      const registered = await oauth2.registerTestUser("user123", {
        name: "Test User",
        email: "test@example.com",
        picture: "https://example.com/avatar.jpg",
      });

      expect(registered).toBe(true);
    });
  });

  describe("Auth Start", () => {
    test("generates authorization URL with required parameters", async () => {
      // User scenario: User clicks "Login with OAuth" button
      const result = await oauth2.handleAuthStart({});

      expect(result.type).toBe(OAuth2MessageType.AUTH_REDIRECT);
      expect(result.url).toContain("https://provider.example.com/oauth2/authorize");
      expect(result.url).toContain("response_type=code");
      expect(result.url).toContain("client_id=test-client-id");
      expect(result.url).toContain("redirect_uri=");
      expect(result.url).toContain("scope=openid+profile+email");
      expect(result.url).toContain("state=");
      expect(result.state).toBeDefined();
      expect(result.state).toHaveLength(32); // 16 bytes hex
    });

    test("includes PKCE parameters by default", async () => {
      // User scenario: Secure OAuth flow with PKCE
      const result = await oauth2.handleAuthStart({});

      expect(result.url).toContain("code_challenge=");
      expect(result.url).toContain("code_challenge_method=S256");
    });

    test("can disable PKCE", async () => {
      // User scenario: Provider doesn't support PKCE
      const oauth2NoPkce = createOAuth2Strategy({
        clientId: "test",
        authorizationURL: "https://provider.example.com/oauth2/authorize",
        pkce: false,
      });

      const result = await oauth2NoPkce.handleAuthStart({});

      expect(result.url).not.toContain("code_challenge");
      expect(result.url).not.toContain("code_challenge_method");

      oauth2NoPkce.cleanup();
    });

    test("preserves redirect URL in state", async () => {
      // User scenario: Remember where user wanted to go after login
      const result = await oauth2.handleAuthStart({
        redirectTo: "/dashboard/settings",
      });

      expect(result.type).toBe(OAuth2MessageType.AUTH_REDIRECT);
      expect(result.state).toBeDefined();
    });
  });

  describe("Auth Callback", () => {
    test("successful callback returns user profile and tokens", async () => {
      // User scenario: Provider redirects back with authorization code
      await oauth2.registerTestUser("oauth-user-1", {
        name: "OAuth User",
        displayName: "OAuth User",
        email: "oauth@example.com",
        picture: "https://example.com/photo.jpg",
      });

      // First initialize the state
      const authStart = await oauth2.handleAuthStart({ redirectTo: "/home" });

      const result = await oauth2.handleAuthCallback({
        code: "oauth-user-1", // Mock: code is userId
        state: authStart.state,
      });

      expect(result.type).toBe(OAuth2MessageType.AUTH_OK);
      expect(result.userId).toBe("oauth-user-1");
      expect(result.profile).toBeDefined();
      expect(result.profile.id).toBe("oauth-user-1");
      expect(result.profile.displayName).toBe("OAuth User");
      expect(result.profile.email).toBe("oauth@example.com");
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(3600);
      expect(result.redirectTo).toBe("/home");
    });

    test("callback fails with missing code", async () => {
      // User scenario: Callback without authorization code
      const authStart = await oauth2.handleAuthStart({});

      const result = await oauth2.handleAuthCallback({
        state: authStart.state,
      });

      expect(result.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result.error).toBe(OAuth2Error.MISSING_CODE);
    });

    test("callback fails with invalid state", async () => {
      // User scenario: CSRF attack or expired state
      await oauth2.registerTestUser("user", {});

      const result = await oauth2.handleAuthCallback({
        code: "user",
        state: "invalid-state-123",
      });

      expect(result.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result.error).toBe(OAuth2Error.INVALID_STATE);
    });

    test("callback fails with invalid code", async () => {
      // User scenario: Invalid or already-used authorization code
      const authStart = await oauth2.handleAuthStart({});

      const result = await oauth2.handleAuthCallback({
        code: "nonexistent-user",
        state: authStart.state,
      });

      expect(result.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result.error).toBe(OAuth2Error.INVALID_CODE);
    });

    test("state can only be used once", async () => {
      // User scenario: Replay attack prevention
      await oauth2.registerTestUser("replay-user", { email: "replay@example.com" });

      const authStart = await oauth2.handleAuthStart({});

      // First callback should succeed
      const result1 = await oauth2.handleAuthCallback({
        code: "replay-user",
        state: authStart.state,
      });
      expect(result1.type).toBe(OAuth2MessageType.AUTH_OK);

      // Second callback with same state should fail
      const result2 = await oauth2.handleAuthCallback({
        code: "replay-user",
        state: authStart.state,
      });
      expect(result2.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result2.error).toBe(OAuth2Error.INVALID_STATE);
    });
  });

  describe("Token Refresh", () => {
    test("refresh returns new access token", async () => {
      // User scenario: Access token expired, need to refresh
      const result = await oauth2.handleTokenRefresh({
        refreshToken: "mock_refresh_abc123",
      });

      expect(result.type).toBe(OAuth2MessageType.TOKEN_REFRESHED);
      expect(result.accessToken).toBeDefined();
      expect(result.expiresIn).toBe(3600);
    });

    test("refresh fails with missing token", async () => {
      // User scenario: No refresh token provided
      const result = await oauth2.handleTokenRefresh({});

      expect(result.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result.error).toBe(OAuth2Error.INVALID_TOKEN);
    });
  });

  describe("Passport.js Strategy Interface", () => {
    test("authenticate initiates OAuth flow when no code", async () => {
      // User scenario: Passport calls authenticate to start OAuth
      const mockReq = {};

      const redirectPromise = new Promise((resolve) => {
        const context = {
          redirect: (url) => resolve({ redirect: true, url }),
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: (err) => resolve({ error: true, err }),
        };
        oauth2.authenticate.call(context, mockReq);
      });

      const result = await redirectPromise;
      expect(result.redirect).toBe(true);
      expect(result.url).toContain("https://provider.example.com/oauth2/authorize");
    });

    test("authenticate handles callback with code", async () => {
      // User scenario: Passport handles callback from provider
      await oauth2.registerTestUser("passport-user", {
        displayName: "Passport User",
        email: "passport@example.com",
      });

      // Initialize state
      const authStart = await oauth2.handleAuthStart({});

      const mockReq = {
        query: {
          code: "passport-user",
          state: authStart.state,
        },
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: (url) => resolve({ redirect: true, url }),
          success: (user, info) => resolve({ success: true, user, info }),
          fail: (info) => reject(new Error(info?.message || "Auth failed")),
          error: (err) => reject(err),
        };
        oauth2.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.id).toBe("passport-user");
      expect(result.info.accessToken).toBeDefined();
    });

    test("authenticate with verify callback", async () => {
      // User scenario: Custom verify to lookup/create user
      const oauth2WithVerify = createOAuth2Strategy(
        {
          clientId: "test",
          authorizationURL: "https://provider.example.com/oauth2/authorize",
        },
        (accessToken, refreshToken, profile, done) => {
          // Transform OAuth profile to app user
          done(null, {
            id: profile.id,
            email: profile.email,
            token: accessToken,
          });
        }
      );

      await oauth2WithVerify.registerTestUser("verify-user", {
        email: "verify@example.com",
      });

      const authStart = await oauth2WithVerify.handleAuthStart({});

      const mockReq = {
        code: "verify-user",
        state: authStart.state,
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: (user) => resolve({ success: true, user }),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        oauth2WithVerify.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.id).toBe("verify-user");
      expect(result.user.email).toBe("verify@example.com");
      expect(result.user.token).toBeDefined();

      oauth2WithVerify.cleanup();
    });

    test("authenticate with passReqToCallback option", async () => {
      // User scenario: Verify callback needs request info
      const oauth2WithReq = createOAuth2Strategy(
        {
          clientId: "test",
          authorizationURL: "https://provider.example.com/oauth2/authorize",
          passReqToCallback: true,
        },
        (req, accessToken, refreshToken, profile, done) => {
          done(null, {
            id: profile.id,
            loginIP: req.ip,
          });
        }
      );

      await oauth2WithReq.registerTestUser("req-user", {});

      const authStart = await oauth2WithReq.handleAuthStart({});

      const mockReq = {
        code: "req-user",
        state: authStart.state,
        ip: "192.168.1.1",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: (user) => resolve({ success: true, user }),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        oauth2WithReq.authenticate.call(context, mockReq);
      });

      const result = await successPromise;
      expect(result.success).toBe(true);
      expect(result.user.loginIP).toBe("192.168.1.1");

      oauth2WithReq.cleanup();
    });

    test("authenticate calls fail on invalid state", async () => {
      // User scenario: CSRF attack detected
      await oauth2.registerTestUser("csrf-user", {});

      const mockReq = {
        query: {
          code: "csrf-user",
          state: "invalid-state",
        },
      };

      const failPromise = new Promise((resolve) => {
        const context = {
          redirect: () => resolve({ redirect: true }),
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: () => resolve({ error: true }),
        };
        oauth2.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.info.code).toBe(OAuth2Error.INVALID_STATE);
    });
  });

  describe("Strategy Aliasing", () => {
    test("OAuth2Strategy is an alias for createOAuth2Strategy", () => {
      // User scenario: Developer uses Passport.js style import
      expect(OAuth2Strategy).toBe(createOAuth2Strategy);

      const strategy = OAuth2Strategy();
      expect(strategy.name).toBe("oauth2");
      expect(typeof strategy.authenticate).toBe("function");
      strategy.cleanup();
    });
  });

  describe("Configuration Access", () => {
    test("exposes configuration for framework integration", () => {
      // User scenario: Framework needs to inspect adapter config
      const customOAuth = createOAuth2Strategy({
        clientId: "google-client-id",
        authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenURL: "https://oauth2.googleapis.com/token",
        callbackURL: "https://myapp.com/auth/google/callback",
        scope: ["openid", "email", "profile", "calendar.readonly"],
      });

      expect(customOAuth._config.clientId).toBe("google-client-id");
      expect(customOAuth._config.authorizationURL).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(customOAuth._config.scope).toContain("calendar.readonly");

      customOAuth.cleanup();
    });
  });

  describe("Multiple Independent Instances", () => {
    test("multiple OAuth2 instances are isolated", async () => {
      // User scenario: App supports multiple OAuth providers
      const google = createOAuth2Strategy({
        clientId: "google-id",
        authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
      });
      const github = createOAuth2Strategy({
        clientId: "github-id",
        authorizationURL: "https://github.com/login/oauth/authorize",
      });

      await google.registerTestUser("google-user", { email: "user@gmail.com" });
      await github.registerTestUser("github-user", { email: "user@github.com" });

      // Initialize states
      const googleStart = await google.handleAuthStart({});
      const githubStart = await github.handleAuthStart({});

      // Google user should only work with google instance
      const googleResult = await google.handleAuthCallback({
        code: "google-user",
        state: googleStart.state,
      });
      expect(googleResult.type).toBe(OAuth2MessageType.AUTH_OK);
      expect(googleResult.profile.email).toBe("user@gmail.com");

      // GitHub user should only work with github instance
      const githubResult = await github.handleAuthCallback({
        code: "github-user",
        state: githubStart.state,
      });
      expect(githubResult.type).toBe(OAuth2MessageType.AUTH_OK);
      expect(githubResult.profile.email).toBe("user@github.com");

      // Cross-instance should fail (wrong state)
      const crossResult = await google.handleAuthCallback({
        code: "google-user",
        state: githubStart.state,
      });
      expect(crossResult.type).toBe(OAuth2MessageType.AUTH_FAIL);

      google.cleanup();
      github.cleanup();
    });
  });

  describe("Full OAuth2 Flow Simulation", () => {
    test("complete authorization code flow", async () => {
      // User scenario: Full OAuth2 flow from start to finish
      // 1. Register user at "provider"
      await oauth2.registerTestUser("fullflow-user", {
        displayName: "Full Flow User",
        email: "fullflow@example.com",
        picture: "https://example.com/avatar.png",
      });

      // 2. Initiate OAuth2 flow
      const authStart = await oauth2.handleAuthStart({
        redirectTo: "/profile",
      });

      expect(authStart.type).toBe(OAuth2MessageType.AUTH_REDIRECT);
      expect(authStart.state).toBeDefined();

      // 3. Simulate user authorizing and callback
      const authCallback = await oauth2.handleAuthCallback({
        code: "fullflow-user",
        state: authStart.state,
      });

      expect(authCallback.type).toBe(OAuth2MessageType.AUTH_OK);
      expect(authCallback.userId).toBe("fullflow-user");
      expect(authCallback.profile.displayName).toBe("Full Flow User");
      expect(authCallback.profile.email).toBe("fullflow@example.com");
      expect(authCallback.accessToken).toBeDefined();
      expect(authCallback.refreshToken).toBeDefined();
      expect(authCallback.redirectTo).toBe("/profile");

      // 4. Simulate token refresh
      const refreshResult = await oauth2.handleTokenRefresh({
        refreshToken: authCallback.refreshToken,
      });

      expect(refreshResult.type).toBe(OAuth2MessageType.TOKEN_REFRESHED);
      expect(refreshResult.accessToken).toBeDefined();
    });
  });

  // ============================================================================
  // Real-world OAuth2 ceremony coverage: Passport single-arg constructor,
  // default-arg fallbacks, provider error paths, and Passport.authenticate
  // dispatch through both redirect and callback paths.
  // ============================================================================
  describe("Passport.js single-arg constructor", () => {
    test("accepts createOAuth2Strategy(verifyFn)", () => {
      const verifyFn = jest.fn();
      const strategy = createOAuth2Strategy(verifyFn);
      expect(strategy.name).toBe("oauth2");
      expect(typeof strategy.authenticate).toBe("function");
      strategy.cleanup();
    });
  });

  describe("Default-argument fallbacks", () => {
    test("handleAuthStart() with no arguments uses default data and redirectTo='/'", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      const result = await strategy.handleAuthStart();
      expect(result.type).toBe(OAuth2MessageType.AUTH_REDIRECT);
      expect(result.state).toBeDefined();
      strategy.cleanup();
    });

    test("registerTestUser(userId) without profile uses default {}", async () => {
      const strategy = createOAuth2Strategy({});
      const ok = await strategy.registerTestUser("test-default-user");
      expect(ok).toBe(true);
      strategy.cleanup();
    });

    test("initializeState(state) without data uses default {}", async () => {
      const strategy = createOAuth2Strategy({});
      const ok = await strategy.initializeState("preset-state");
      expect(ok).toBe(true);
      strategy.cleanup();
    });
  });

  describe("Provider error path in handleAuthCallback", () => {
    // Scenario: token-exchange / profile-construction throws (e.g. malformed
    // JSON from provider). The catch block must surface PROVIDER_ERROR with
    // the inner err.message preserved.
    test("catch block returns PROVIDER_ERROR using err.message", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.initializeState("err-state", { redirectTo: "/" });
      await strategy.registerTestUser("err-user", {
        get displayName() { throw new Error("provider DB down"); },
        get name() { throw new Error("provider DB down"); },
      });
      const result = await strategy.handleAuthCallback({
        code: "err-user",
        state: "err-state",
      });
      expect(result.type).toBe(OAuth2MessageType.AUTH_FAIL);
      expect(result.error).toBe(OAuth2Error.PROVIDER_ERROR);
      expect(result.message).toMatch(/provider DB down/);
      strategy.cleanup();
    });

    // Scenario: thrown value has no .message (e.g. `throw "string"`). Fallback
    // string engages.
    test("catch block falls back to default message when err has none", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.initializeState("nomsg-state", { redirectTo: "/" });
      await strategy.registerTestUser("nomsg-user", {
        get displayName() { throw ""; },
        get name() { throw ""; },
      });
      const result = await strategy.handleAuthCallback({
        code: "nomsg-user",
        state: "nomsg-state",
      });
      expect(result.error).toBe(OAuth2Error.PROVIDER_ERROR);
      expect(result.message).toBe("Failed to complete OAuth2 flow");
      strategy.cleanup();
    });
  });

  describe("Passport.js authenticate()", () => {
    function ctx() {
      return {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
        redirect: jest.fn(),
      };
    }

    test("redirect path (no code) calls self.redirect with auth URL", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      const c = ctx();
      strategy.authenticate.call(c, {});
      await new Promise((r) => setImmediate(r));
      expect(c.redirect).toHaveBeenCalledWith(expect.stringContaining("response_type=code"));
      strategy.cleanup();
    });

    test("redirect path forwards options.redirectTo", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      const c = ctx();
      strategy.authenticate.call(c, {}, { redirectTo: "/dash" });
      await new Promise((r) => setImmediate(r));
      expect(c.redirect).toHaveBeenCalled();
      strategy.cleanup();
    });

    // Scenario: the underlying state-generation helper throws (e.g. the
    // entropy source is unavailable). handleAuthStart's only synchronous
    // op fails, so the redirect path's outer .catch engages and forwards
    // to self.error.
    // Scenario: generateState throws AND the Passport context has no
    // .error handler. The catch's `if (typeof self.error === "function")`
    // false branch engages — silent no-op.
    test("redirect path is silent when generateState fails AND no self.error", async () => {
      await new Promise((resolve) => {
        jest.isolateModules(() => {
          jest.doMock("./oauth2/helpers", () => ({
            createDefaultStorage: () => ({
              saveState: async () => {},
              getState: async () => null,
              deleteState: async () => {},
              registerMockUser: async () => true,
              getMockUser: async () => null,
              createMockToken: async () => ({ access_token: "t" }),
            }),
            generateState: () => { throw new Error("boom"); },
            generateCodeVerifier: () => "v",
            generateCodeChallenge: () => "c",
          }));
          const { createOAuth2Strategy: createOAuth2 } = require("./oauth2");
          const strategy = createOAuth2({ pkce: false });
          const c = {
            success: jest.fn(),
            fail: jest.fn(),
            redirect: jest.fn(),
            // self.error intentionally absent
          };
          strategy.authenticate.call(c, {}, {});
          setImmediate(() => {
            // No throw, no unhandled rejection — false branch engaged
            expect(c.success).not.toHaveBeenCalled();
            strategy.cleanup();
            jest.dontMock("./oauth2/helpers");
            resolve();
          });
        });
      });
    });

    test("redirect path catches generateState failure via self.error", async () => {
      // Use jest.isolateModules so the doMock applies cleanly to the
      // re-required oauth2 module.
      await new Promise((resolve, reject) => {
        jest.isolateModules(() => {
          jest.doMock("./oauth2/helpers", () => ({
            createDefaultStorage: () => ({
              saveState: async () => {},
              getState: async () => null,
              deleteState: async () => {},
              registerMockUser: async () => true,
              getMockUser: async () => null,
              createMockToken: async () => ({
                access_token: "t",
                refresh_token: "r",
                expires_in: 3600,
              }),
            }),
            generateState: () => { throw new Error("state-gen failed"); },
            generateCodeVerifier: () => "v",
            generateCodeChallenge: () => "c",
          }));
          const { createOAuth2Strategy: createOAuth2 } = require("./oauth2");
          const strategy = createOAuth2({ pkce: false });
          const errSpy = jest.fn();
          const c = {
            success: jest.fn(),
            fail: jest.fn(),
            error: errSpy,
            redirect: jest.fn(),
          };
          strategy.authenticate.call(c, {}, {});
          setImmediate(() => {
            try {
              expect(errSpy).toHaveBeenCalledWith(expect.any(Error));
              resolve();
            } catch (e) {
              reject(e);
            } finally {
              strategy.cleanup();
              jest.dontMock("./oauth2/helpers");
            }
          });
        });
      });
    });

    test("callback path with code and matching state succeeds and calls self.success", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.registerTestUser("auth-pp-user", {
        displayName: "Pass Port",
        email: "pp@ex.com",
      });
      const start = await strategy.handleAuthStart({ redirectTo: "/p" });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "auth-pp-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.success).toHaveBeenCalledWith(
        expect.objectContaining({ id: "auth-pp-user" }),
        expect.objectContaining({ userId: "auth-pp-user" }),
      );
      strategy.cleanup();
    });

    test("callback path with bad state calls self.fail", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "anything", state: "nonexistent-state" },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.fail).toHaveBeenCalledWith(expect.objectContaining({
        code: OAuth2Error.INVALID_STATE,
      }));
      strategy.cleanup();
    });

    test("callback path with verify callback success", async () => {
      const verifyFn = jest.fn((accessToken, refreshToken, profile, done) =>
        done(null, { id: profile.id, role: "admin" }),
      );
      const strategy = createOAuth2Strategy({ pkce: false }, verifyFn);
      await strategy.registerTestUser("vfy-user", { displayName: "VFY" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "vfy-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(verifyFn).toHaveBeenCalled();
      expect(c.success).toHaveBeenCalledWith({ id: "vfy-user", role: "admin" }, undefined);
      strategy.cleanup();
    });

    test("callback path with verify done(err) routes to self.error", async () => {
      const verifyFn = jest.fn((at, rt, p, done) => done(new Error("verify err")));
      const strategy = createOAuth2Strategy({ pkce: false }, verifyFn);
      await strategy.registerTestUser("vye-user", { displayName: "VYE" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "vye-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
      strategy.cleanup();
    });

    test("callback path with verify done(null, false) without info uses default", async () => {
      const verifyFn = jest.fn((at, rt, p, done) => done(null, false));
      const strategy = createOAuth2Strategy({ pkce: false }, verifyFn);
      await strategy.registerTestUser("vyf-user", { displayName: "VYF" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "vyf-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.fail).toHaveBeenCalledWith({ message: "Verification failed" });
      strategy.cleanup();
    });

    test("callback path with verify throwing synchronously routes to self.error", async () => {
      const verifyFn = jest.fn(() => { throw new Error("sync verify boom"); });
      const strategy = createOAuth2Strategy({ pkce: false }, verifyFn);
      await strategy.registerTestUser("vyb-user", { displayName: "VYB" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      strategy.authenticate.call(c, {
        query: { code: "vyb-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
      strategy.cleanup();
    });

    test("callback path passReqToCallback=true forwards req to verify", async () => {
      const verifyFn = jest.fn((req, at, rt, p, done) => done(null, { id: p.id, ip: req.ip }));
      const strategy = createOAuth2Strategy(
        { pkce: false, passReqToCallback: true },
        verifyFn,
      );
      await strategy.registerTestUser("vyr-user", { displayName: "VYR" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      const req = { query: { code: "vyr-user", state: start.state }, ip: "1.2.3.4" };
      strategy.authenticate.call(c, req);
      await new Promise((r) => setImmediate(r));
      expect(verifyFn).toHaveBeenCalledWith(req, expect.anything(), expect.anything(), expect.anything(), expect.any(Function));
      strategy.cleanup();
    });

    test("callback path catch invokes self.error when self.success throws", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.registerTestUser("succ-throw-user", { displayName: "ST" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = {
        success: () => { throw new Error("success crash"); },
        fail: jest.fn(),
        error: jest.fn(),
        redirect: jest.fn(),
      };
      strategy.authenticate.call(c, {
        query: { code: "succ-throw-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
      strategy.cleanup();
    });

    test("callback path catch is no-op when self.error is not a function", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.registerTestUser("silent-user", { displayName: "Silent" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = {
        success: () => { throw new Error("silent crash"); },
        fail: jest.fn(),
        redirect: jest.fn(),
      };
      strategy.authenticate.call(c, {
        query: { code: "silent-user", state: start.state },
      });
      await new Promise((r) => setImmediate(r));
      expect(typeof c.success).toBe("function");
      strategy.cleanup();
    });

    // Scenario: callback path receives code+state via req.code / req.state
    // properties (instead of req.query). The OR-fallback expression
    // `req.query?.code || req.code` engages on the RHS.
    test("callback path reads code/state from top-level req fields", async () => {
      const strategy = createOAuth2Strategy({ pkce: false });
      await strategy.registerTestUser("topfield-user", { displayName: "TF" });
      const start = await strategy.handleAuthStart({ redirectTo: "/" });
      const c = ctx();
      strategy.authenticate.call(c, {
        code: "topfield-user",
        state: start.state,
      });
      await new Promise((r) => setImmediate(r));
      expect(c.success).toHaveBeenCalledWith(
        expect.objectContaining({ id: "topfield-user" }),
        expect.any(Object),
      );
      strategy.cleanup();
    });
  });
});
