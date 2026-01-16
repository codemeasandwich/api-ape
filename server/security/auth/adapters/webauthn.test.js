/**
 * @fileoverview Tests for WebAuthn Authentication Adapter
 */

const {
  createWebAuthnStrategy,
  Strategy,
  WebAuthnMessageType,
  WebAuthnError,
} = require("./webauthn");

describe("WebAuthn Adapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = createWebAuthnStrategy({
      rpId: "example.com",
      rpName: "Example App",
    });
    // Clear the default credential store between tests
    adapter._defaultCredentialStore.clear();
  });

  describe("Strategy Interface", () => {
    test("exports Strategy alias", () => {
      expect(Strategy).toBe(createWebAuthnStrategy);
    });

    test("has Passport.js required properties", () => {
      expect(adapter.name).toBe("webauthn");
      expect(typeof adapter.authenticate).toBe("function");
    });

    test("has api-ape adapter properties", () => {
      expect(adapter.type).toBe("webauthn");
      expect(adapter.tier).toBe(2);
    });

    test("accepts Passport.js style (verify) constructor", () => {
      const verifyFn = jest.fn();
      const strategy = createWebAuthnStrategy(verifyFn);
      expect(strategy.name).toBe("webauthn");
    });

    test("accepts Passport.js style (options, verify) constructor", () => {
      const verifyFn = jest.fn();
      const strategy = createWebAuthnStrategy(
        { rpId: "test.com" },
        verifyFn
      );
      expect(strategy.name).toBe("webauthn");
    });
  });

  describe("Registration Flow", () => {
    test("handleRegStart returns registration challenge", async () => {
      const result = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "alice",
        userName: "alice@example.com",
      });

      expect(result.type).toBe(WebAuthnMessageType.REG_CHALLENGE);
      expect(result.challenge).toBeDefined();
      expect(result.rp.id).toBe("example.com");
      expect(result.rp.name).toBe("Example App");
      expect(result.user.name).toBe("alice@example.com");
      expect(result.pubKeyCredParams).toHaveLength(2);
    });

    test("handleRegStart excludes existing credentials", async () => {
      // Register first credential
      const firstChallenge = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "alice",
        userName: "alice@example.com",
      });

      await adapter.handleRegFinish({
        clientId: "test-client",
        userId: "alice",
        challenge: firstChallenge.challenge,
        attestation: {
          id: "credential-1",
          response: { publicKey: "key1" },
        },
      });

      // Second registration should exclude first credential
      const secondChallenge = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "alice",
        userName: "alice@example.com",
      });

      expect(secondChallenge.excludeCredentials).toHaveLength(1);
      expect(secondChallenge.excludeCredentials[0].id).toBe("credential-1");
    });

    test("handleRegFinish stores credential (mock mode)", async () => {
      const challenge = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "bob",
        userName: "bob@example.com",
      });

      const result = await adapter.handleRegFinish({
        clientId: "test-client",
        userId: "bob",
        challenge: challenge.challenge,
        attestation: {
          id: "test-credential-id",
          response: {
            publicKey: "mock-public-key",
            transports: ["internal", "hybrid"],
          },
        },
      });

      expect(result.type).toBe(WebAuthnMessageType.REG_OK);
      expect(result.credentialId).toBe("test-credential-id");
    });

    test("handleRegFinish rejects expired challenge", async () => {
      const fastAdapter = createWebAuthnStrategy({
        rpId: "example.com",
        challengeTimeout: 1, // 1ms timeout
      });

      const challenge = await fastAdapter.handleRegStart({
        clientId: "test-client",
        userId: "charlie",
        userName: "charlie@example.com",
      });

      // Wait for challenge to expire
      await new Promise((r) => setTimeout(r, 10));

      await expect(
        fastAdapter.handleRegFinish({
          clientId: "test-client",
          userId: "charlie",
          challenge: challenge.challenge,
          attestation: { id: "cred" },
        })
      ).rejects.toMatchObject({ code: WebAuthnError.CHALLENGE_EXPIRED });
    });

    test("handleRegFinish rejects duplicate credential", async () => {
      const challenge1 = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "david",
        userName: "david@example.com",
      });

      await adapter.handleRegFinish({
        clientId: "test-client",
        userId: "david",
        challenge: challenge1.challenge,
        attestation: {
          id: "duplicate-cred-id",
          response: { publicKey: "key1" },
        },
      });

      const challenge2 = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "david",
        userName: "david@example.com",
      });

      await expect(
        adapter.handleRegFinish({
          clientId: "test-client",
          userId: "david",
          challenge: challenge2.challenge,
          attestation: {
            id: "duplicate-cred-id",
            response: { publicKey: "key2" },
          },
        })
      ).rejects.toMatchObject({ code: WebAuthnError.DUPLICATE_CREDENTIAL });
    });
  });

  describe("Authentication Flow", () => {
    beforeEach(async () => {
      // Register a credential first
      const challenge = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "testuser",
        userName: "testuser@example.com",
      });

      await adapter.handleRegFinish({
        clientId: "test-client",
        userId: "testuser",
        challenge: challenge.challenge,
        attestation: {
          id: "test-cred-123",
          response: { publicKey: "test-public-key" },
        },
      });
    });

    test("handleAuthStart returns authentication challenge", async () => {
      const result = await adapter.handleAuthStart({
        clientId: "auth-client",
        userId: "testuser",
      });

      expect(result.type).toBe(WebAuthnMessageType.AUTH_CHALLENGE);
      expect(result.challenge).toBeDefined();
      expect(result.rpId).toBe("example.com");
      expect(result.allowCredentials).toHaveLength(1);
      expect(result.allowCredentials[0].id).toBe("test-cred-123");
    });

    test("handleAuthStart rejects user without credentials", async () => {
      await expect(
        adapter.handleAuthStart({
          clientId: "auth-client",
          userId: "unknown-user",
        })
      ).rejects.toMatchObject({ code: WebAuthnError.CREDENTIAL_NOT_FOUND });
    });

    test("handleAuthFinish verifies assertion (mock mode)", async () => {
      const challenge = await adapter.handleAuthStart({
        clientId: "auth-client",
        userId: "testuser",
      });

      const result = await adapter.handleAuthFinish({
        clientId: "auth-client",
        userId: "testuser",
        challenge: challenge.challenge,
        assertion: {
          id: "test-cred-123",
          response: {
            authenticatorData: "mock-auth-data",
            signature: "mock-signature",
          },
        },
      });

      expect(result.type).toBe(WebAuthnMessageType.AUTH_OK);
      expect(result.credentialId).toBe("test-cred-123");
      expect(result.method).toBe("webauthn");
      expect(result.verified).toBe(true);
    });

    test("handleAuthFinish rejects unknown credential", async () => {
      const challenge = await adapter.handleAuthStart({
        clientId: "auth-client",
        userId: "testuser",
      });

      await expect(
        adapter.handleAuthFinish({
          clientId: "auth-client",
          userId: "testuser",
          challenge: challenge.challenge,
          assertion: {
            id: "wrong-cred-id",
            response: {},
          },
        })
      ).rejects.toMatchObject({ code: WebAuthnError.CREDENTIAL_NOT_FOUND });
    });

    test("handleAuthFinish rejects expired challenge", async () => {
      const fastAdapter = createWebAuthnStrategy({
        rpId: "example.com",
        challengeTimeout: 1,
      });

      // Register credential
      const regChallenge = await fastAdapter.handleRegStart({
        clientId: "test-client",
        userId: "fastuser",
        userName: "fast@example.com",
      });

      await fastAdapter.handleRegFinish({
        clientId: "test-client",
        userId: "fastuser",
        challenge: regChallenge.challenge,
        attestation: { id: "fast-cred" },
      });

      const authChallenge = await fastAdapter.handleAuthStart({
        clientId: "auth-client",
        userId: "fastuser",
      });

      // Wait for challenge to expire
      await new Promise((r) => setTimeout(r, 10));

      await expect(
        fastAdapter.handleAuthFinish({
          clientId: "auth-client",
          userId: "fastuser",
          challenge: authChallenge.challenge,
          assertion: { id: "fast-cred" },
        })
      ).rejects.toMatchObject({ code: WebAuthnError.CHALLENGE_EXPIRED });
    });
  });

  describe("Passport.js authenticate()", () => {
    beforeEach(async () => {
      // Register a credential
      const challenge = await adapter.handleRegStart({
        clientId: "test-client",
        userId: "passportuser",
        userName: "passport@example.com",
      });

      await adapter.handleRegFinish({
        clientId: "test-client",
        userId: "passportuser",
        challenge: challenge.challenge,
        attestation: { id: "passport-cred" },
      });
    });

    test("calls this.fail() when credentials missing", (done) => {
      const req = { body: {}, query: {} };

      adapter.authenticate.call(
        {
          fail: (info, status) => {
            expect(info.message).toBe("Missing WebAuthn credentials");
            expect(status).toBe(400);
            done();
          },
          success: () => done(new Error("Should not succeed")),
          error: () => done(new Error("Should not error")),
        },
        req
      );
    });

    test("calls this.success() on valid assertion", async () => {
      const authChallenge = await adapter.handleAuthStart({
        clientId: "passport-client",
        userId: "passportuser",
      });

      const req = {
        clientId: "passport-client",
        body: {
          userId: "passportuser",
          challenge: authChallenge.challenge,
          assertion: {
            id: "passport-cred",
            response: {},
          },
        },
        query: {},
      };

      await new Promise((resolve, reject) => {
        adapter.authenticate.call(
          {
            success: (user, info) => {
              expect(user.userId).toBe("passportuser");
              expect(user.credentialId).toBe("passport-cred");
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

      const verifyAdapter = createWebAuthnStrategy(
        { rpId: "example.com" },
        verifyFn
      );

      // Register credential
      const regChallenge = await verifyAdapter.handleRegStart({
        clientId: "test-client",
        userId: "verifyuser",
        userName: "verify@example.com",
      });

      await verifyAdapter.handleRegFinish({
        clientId: "test-client",
        userId: "verifyuser",
        challenge: regChallenge.challenge,
        attestation: { id: "verify-cred" },
      });

      const authChallenge = await verifyAdapter.handleAuthStart({
        clientId: "verify-client",
        userId: "verifyuser",
      });

      const req = {
        clientId: "verify-client",
        body: {
          userId: "verifyuser",
          challenge: authChallenge.challenge,
          assertion: { id: "verify-cred" },
        },
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

    test("calls this.fail() when verify callback rejects user", async () => {
      const verifyFn = jest.fn((user, done) => {
        done(null, false, { message: "User not allowed" });
      });

      const verifyAdapter = createWebAuthnStrategy(
        { rpId: "example.com" },
        verifyFn
      );

      // Register credential
      const regChallenge = await verifyAdapter.handleRegStart({
        clientId: "test-client",
        userId: "rejectuser",
        userName: "reject@example.com",
      });

      await verifyAdapter.handleRegFinish({
        clientId: "test-client",
        userId: "rejectuser",
        challenge: regChallenge.challenge,
        attestation: { id: "reject-cred" },
      });

      const authChallenge = await verifyAdapter.handleAuthStart({
        clientId: "reject-client",
        userId: "rejectuser",
      });

      const req = {
        clientId: "reject-client",
        body: {
          userId: "rejectuser",
          challenge: authChallenge.challenge,
          assertion: { id: "reject-cred" },
        },
        query: {},
      };

      await new Promise((resolve) => {
        verifyAdapter.authenticate.call(
          {
            success: () => {
              throw new Error("Should not succeed");
            },
            fail: (info) => {
              expect(info.message).toBe("User not allowed");
              resolve();
            },
            error: () => {
              throw new Error("Should not error");
            },
          },
          req
        );
      });
    });
  });

  describe("Utility Methods", () => {
    test("hasWebAuthnLib returns false when no lib configured", () => {
      expect(adapter.hasWebAuthnLib()).toBe(false);
    });

    test("hasWebAuthnLib returns true when lib is provided", () => {
      const adapterWithLib = createWebAuthnStrategy({
        webauthnLib: { verifyRegistrationResponse: () => {} },
      });
      expect(adapterWithLib.hasWebAuthnLib()).toBe(true);
    });

    test("cleanupClient does not throw", () => {
      expect(() => adapter.cleanupClient("some-client")).not.toThrow();
    });
  });

  describe("Configuration Options", () => {
    test("uses custom rpId and rpName", async () => {
      const customAdapter = createWebAuthnStrategy({
        rpId: "custom.example.org",
        rpName: "Custom App",
      });

      const result = await customAdapter.handleRegStart({
        clientId: "test-client",
        userId: "user1",
        userName: "user1@custom.org",
      });

      expect(result.rp.id).toBe("custom.example.org");
      expect(result.rp.name).toBe("Custom App");
    });

    test("uses custom challengeTimeout", async () => {
      const customAdapter = createWebAuthnStrategy({
        rpId: "example.com",
        challengeTimeout: 120000,
      });

      const result = await customAdapter.handleRegStart({
        clientId: "test-client",
        userId: "user1",
        userName: "user1@example.com",
      });

      expect(result.timeout).toBe(120000);
    });

    test("uses custom userVerification", async () => {
      const customAdapter = createWebAuthnStrategy({
        rpId: "example.com",
        userVerification: "required",
      });

      const result = await customAdapter.handleRegStart({
        clientId: "test-client",
        userId: "user1",
        userName: "user1@example.com",
      });

      expect(result.authenticatorSelection.userVerification).toBe("required");
    });
  });
});
