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

  // ============================================================================
  // Real-world WebAuthn ceremony scenarios that exercise the remaining branches.
  // ============================================================================
  // Scenario: a server-side enrollment flow has only the userId (e.g. machine
  // account) — userName and userDisplayName are not provided. The registration
  // options builder must fall back to the userId for both fields.
  describe("handleRegStart with missing userName/userDisplayName", () => {
    test("falls back to userId for name and displayName when not supplied", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      const result = await wa.handleRegStart({
        clientId: "c-min",
        userId: "machine-account-001",
      });
      expect(result.user.name).toBe("machine-account-001");
      expect(result.user.displayName).toBe("machine-account-001");
    });

    // Scenario: only userName provided (no friendly displayName). The middle
    // OR-arm of `userDisplayName || userName || userId` engages.
    test("falls back to userName for displayName when only userName provided", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      const result = await wa.handleRegStart({
        clientId: "c-mid",
        userId: "uid-mid",
        userName: "primary-name",
      });
      expect(result.user.name).toBe("primary-name");
      expect(result.user.displayName).toBe("primary-name");
    });
  });

  // Scenario: integrator uses an external getCredentials hook that returns a
  // credential, but the default updateCredential storage doesn't have an
  // entry for that user (rare configuration / migration race). The update
  // must return false defensively without throwing.
  describe("updateCredential defensive false branch", () => {
    test("returns false silently when default store has no entry for the user", async () => {
      // Authenticate against a getCredentials hook that returns a credential,
      // but use the default updateCredential which queries _defaultCredentialStore
      // directly. Because we never call _defaultCredentialStore.set, the
      // updateCredential will return false. The auth path must not throw.
      const lib = {
        verifyAuthenticationResponse: jest.fn(async () => ({
          verified: true,
          authenticationInfo: { newCounter: 99 },
        })),
      };
      const fakeCred = { id: "split-cred", publicKey: "pk", counter: 0, transports: ["internal"] };
      const wa = createWebAuthnStrategy({
        rpId: "ex.com",
        webauthnLib: lib,
        // External read source that has the credential
        getCredentials: async () => [fakeCred],
        // Use the DEFAULT updateCredential which reads _defaultCredentialStore
      });
      const opts = await wa.handleAuthStart({ clientId: "c-split", userId: "split-user" });
      const result = await wa.handleAuthFinish({
        clientId: "c-split",
        userId: "split-user",
        challenge: opts.challenge,
        assertion: { id: "split-cred" },
      });
      // Auth still succeeds — the counter update is best-effort
      expect(result.verified).toBe(true);
    });
  });

  describe("Pending-challenge auto-cleanup timer", () => {
    test("removes the challenge once challengeTimeout+1000ms elapses", async () => {
      jest.useFakeTimers();
      try {
        const wa = createWebAuthnStrategy({ rpId: "ex.com", challengeTimeout: 5000 });
        const result = await wa.handleRegStart({
          clientId: "c-t",
          userId: "u-t",
          userName: "ut@ex.com",
        });
        const key = `u-t:${result.challenge}`;
        expect(wa._pendingChallenges.has(key)).toBe(true);
        jest.advanceTimersByTime(6001);
        expect(wa._pendingChallenges.has(key)).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("consumeChallenge edge cases", () => {
    // Scenario: attacker submits attestation referencing an unissued challenge.
    test("handleRegFinish throws CHALLENGE_EXPIRED for unknown challenge", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      await expect(
        wa.handleRegFinish({
          clientId: "c-x",
          userId: "u-x",
          challenge: "never-issued-challenge",
          attestation: { id: "abc", response: {} },
        }),
      ).rejects.toMatchObject({ code: WebAuthnError.CHALLENGE_EXPIRED });
    });
  });

  describe("Stored credentials without transports", () => {
    // Scenario: credential persisted by an older client without a transports
    // list. The `c.transports || ["internal"]` fallback must engage.
    test("excludeCredentials fills missing transports with ['internal']", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      wa._defaultCredentialStore.set("trans-u", [{ id: "cred-1", publicKey: "k", counter: 0 }]);
      const result = await wa.handleRegStart({
        clientId: "c-tr",
        userId: "trans-u",
        userName: "tr@ex.com",
      });
      const entry = result.excludeCredentials.find((c) => c.id === "cred-1");
      expect(entry.transports).toEqual(["internal"]);
    });

    test("allowCredentials fills missing transports with ['internal']", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      wa._defaultCredentialStore.set("trans-u2", [{ id: "cred-2", publicKey: "k", counter: 0 }]);
      const result = await wa.handleAuthStart({
        clientId: "c-tr",
        userId: "trans-u2",
      });
      const entry = result.allowCredentials.find((c) => c.id === "cred-2");
      expect(entry.transports).toEqual(["internal"]);
    });
  });

  describe("webauthnLib delegation: registration and authentication paths", () => {
    test("delegates verifyRegistrationResponse to library and persists credential", async () => {
      const lib = {
        verifyRegistrationResponse: jest.fn(async () => ({
          verified: true,
          registrationInfo: {
            credentialID: "lib-cred-1",
            credentialPublicKey: "lib-pub-key",
            counter: 0,
            credentialDeviceType: "platform",
            credentialBackedUp: true,
          },
        })),
      };
      const wa = createWebAuthnStrategy({ rpId: "ex.com", webauthnLib: lib });
      const opts = await wa.handleRegStart({
        clientId: "c-lib",
        userId: "lib-user",
        userName: "lib@ex.com",
      });
      const result = await wa.handleRegFinish({
        clientId: "c-lib",
        userId: "lib-user",
        challenge: opts.challenge,
        attestation: { id: "raw-id", response: {} },
      });
      expect(result.credentialId).toBe("lib-cred-1");
      expect(lib.verifyRegistrationResponse).toHaveBeenCalled();
    });

    test("throws INVALID_ATTESTATION when verifyRegistrationResponse reports verified=false", async () => {
      const lib = {
        verifyRegistrationResponse: jest.fn(async () => ({ verified: false })),
      };
      const wa = createWebAuthnStrategy({ rpId: "ex.com", webauthnLib: lib });
      const opts = await wa.handleRegStart({
        clientId: "c-lib2",
        userId: "lib-user2",
        userName: "lib2@ex.com",
      });
      await expect(
        wa.handleRegFinish({
          clientId: "c-lib2",
          userId: "lib-user2",
          challenge: opts.challenge,
          attestation: { id: "raw", response: {} },
        }),
      ).rejects.toMatchObject({ code: WebAuthnError.INVALID_ATTESTATION });
    });

    test("delegates verifyAuthenticationResponse to library and updates counter", async () => {
      const lib = {
        verifyAuthenticationResponse: jest.fn(async () => ({
          verified: true,
          authenticationInfo: { newCounter: 42 },
        })),
      };
      const wa = createWebAuthnStrategy({ rpId: "ex.com", webauthnLib: lib });
      wa._defaultCredentialStore.set("la-user", [
        { id: "auth-cred-1", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-la", userId: "la-user" });
      const result = await wa.handleAuthFinish({
        clientId: "c-la",
        userId: "la-user",
        challenge: opts.challenge,
        assertion: { id: "auth-cred-1" },
      });
      expect(result.verified).toBe(true);
      const updated = wa._defaultCredentialStore.get("la-user")[0];
      expect(updated.counter).toBe(42);
    });

    test("throws INVALID_ASSERTION when verifyAuthenticationResponse reports verified=false", async () => {
      const lib = {
        verifyAuthenticationResponse: jest.fn(async () => ({ verified: false })),
      };
      const wa = createWebAuthnStrategy({ rpId: "ex.com", webauthnLib: lib });
      wa._defaultCredentialStore.set("la-user2", [
        { id: "auth-cred-2", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-la2", userId: "la-user2" });
      await expect(
        wa.handleAuthFinish({
          clientId: "c-la2",
          userId: "la-user2",
          challenge: opts.challenge,
          assertion: { id: "auth-cred-2" },
        }),
      ).rejects.toMatchObject({ code: WebAuthnError.INVALID_ASSERTION });
    });
  });

  describe("Mock verifier fallback branches", () => {
    // Scenario: attestation lacks `id` — the mock verifier generates one.
    test("generates credentialID when attestation.id is missing", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      const opts = await wa.handleRegStart({
        clientId: "c-noid",
        userId: "noid-user",
        userName: "noid@ex.com",
      });
      const result = await wa.handleRegFinish({
        clientId: "c-noid",
        userId: "noid-user",
        challenge: opts.challenge,
        attestation: {},
      });
      expect(result.credentialId).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("Passport.js authenticate() integration", () => {
    function ctx() {
      return { success: jest.fn(), fail: jest.fn(), error: jest.fn() };
    }

    test("fails 400 when assertion/challenge/userId missing", () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      const c = ctx();
      wa.authenticate.call(c, { body: {}, query: {} });
      expect(c.fail).toHaveBeenCalledWith({ message: "Missing WebAuthn credentials" }, 400);
    });

    test("falls back to 'http' clientId when req.clientId is missing", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      wa._defaultCredentialStore.set("p-user", [
        { id: "p-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-p", userId: "p-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "p-cred" },
          challenge: opts.challenge,
          userId: "p-user",
        },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.success).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "p-user", credentialId: "p-cred" }),
        expect.any(Object),
      );
    });

    test("catch handler reports failure with err.code/message on unknown credential", async () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      wa._defaultCredentialStore.set("u-user", [
        { id: "valid-cred", publicKey: "pk", counter: 0 },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-u", userId: "u-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "unknown-cred" },
          challenge: opts.challenge,
          userId: "u-user",
        },
        query: {},
      });
      await new Promise((r) => setImmediate(r));
      expect(c.fail).toHaveBeenCalledWith({
        message: expect.stringContaining("Credential not found"),
        code: WebAuthnError.CREDENTIAL_NOT_FOUND,
      });
    });

    test("invokes verify callback and calls success on returned user", async () => {
      const verifyCb = jest.fn((info, done) =>
        done(null, { id: info.userId, name: "VW" }),
      );
      const wa = createWebAuthnStrategy({ rpId: "ex.com" }, verifyCb);
      wa._defaultCredentialStore.set("v-user", [
        { id: "v-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-v", userId: "v-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "v-cred" },
          challenge: opts.challenge,
          userId: "v-user",
        },
      });
      await new Promise((r) => setImmediate(r));
      expect(verifyCb).toHaveBeenCalled();
      expect(c.success).toHaveBeenCalledWith(
        { id: "v-user", name: "VW" },
        undefined,
      );
    });

    test("verify callback done(err) routes to strategy.error()", async () => {
      const verifyCb = jest.fn((info, done) => done(new Error("verify failed")));
      const wa = createWebAuthnStrategy({ rpId: "ex.com" }, verifyCb);
      wa._defaultCredentialStore.set("ve-user", [
        { id: "ve-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-ve", userId: "ve-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "ve-cred" },
          challenge: opts.challenge,
          userId: "ve-user",
        },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
    });

    test("verify callback done(null, false) without info uses default message", async () => {
      const verifyCb = jest.fn((info, done) => done(null, false));
      const wa = createWebAuthnStrategy({ rpId: "ex.com" }, verifyCb);
      wa._defaultCredentialStore.set("vf-user", [
        { id: "vf-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-vf", userId: "vf-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "vf-cred" },
          challenge: opts.challenge,
          userId: "vf-user",
        },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.fail).toHaveBeenCalledWith({ message: "Verification failed" });
    });

    test("verify callback throwing synchronously routes to strategy.error()", async () => {
      const verifyCb = jest.fn(() => {
        throw new Error("verify boom");
      });
      const wa = createWebAuthnStrategy({ rpId: "ex.com" }, verifyCb);
      wa._defaultCredentialStore.set("vb-user", [
        { id: "vb-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-vb", userId: "vb-user" });
      const c = ctx();
      wa.authenticate.call(c, {
        body: {
          assertion: { id: "vb-cred" },
          challenge: opts.challenge,
          userId: "vb-user",
        },
      });
      await new Promise((r) => setImmediate(r));
      expect(c.error).toHaveBeenCalledWith(expect.any(Error));
    });

    test("passReqToCallback=true forwards the request to verify callback", async () => {
      const verifyCb = jest.fn((req, info, done) => done(null, { id: info.userId }));
      const wa = createWebAuthnStrategy(
        { rpId: "ex.com", passReqToCallback: true },
        verifyCb,
      );
      wa._defaultCredentialStore.set("pr-user", [
        { id: "pr-cred", publicKey: "pk", counter: 0, transports: ["internal"] },
      ]);
      const opts = await wa.handleAuthStart({ clientId: "c-pr", userId: "pr-user" });
      const c = ctx();
      const req = {
        body: {
          assertion: { id: "pr-cred" },
          challenge: opts.challenge,
          userId: "pr-user",
        },
      };
      wa.authenticate.call(c, req);
      await new Promise((r) => setImmediate(r));
      expect(verifyCb).toHaveBeenCalledWith(req, expect.objectContaining({ userId: "pr-user" }), expect.any(Function));
    });

    test("authenticate handles a request with no body or query", () => {
      const wa = createWebAuthnStrategy({ rpId: "ex.com" });
      const c = ctx();
      wa.authenticate.call(c, {});
      expect(c.fail).toHaveBeenCalledWith({ message: "Missing WebAuthn credentials" }, 400);
    });
  });
});
