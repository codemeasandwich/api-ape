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
});
