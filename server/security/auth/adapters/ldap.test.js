/**
 * @fileoverview Integration tests for LDAP Authentication Adapter
 *
 * Tests the LDAP adapter through its public interface following the
 * "test functionality not functions" philosophy.
 */

const { createLDAPStrategy, LDAPMessageType, LDAPError, LDAPStrategy } = require("./ldap");

describe("LDAP Authentication Adapter", () => {
  let ldap;

  beforeEach(() => {
    ldap = createLDAPStrategy({
      url: "ldap://localhost:389",
      baseDN: "ou=users,dc=example,dc=com",
    });
  });

  afterEach(() => {
    ldap.cleanup();
  });

  describe("User Registration (Mock Mode)", () => {
    test("can register a test user for mock authentication", async () => {
      // User scenario: Developer sets up test user in mock mode
      const registered = await ldap.registerTestUser("testuser", "password123", {
        cn: "Test User",
        mail: "testuser@example.com",
        memberOf: ["cn=developers,ou=groups,dc=example,dc=com"],
      });

      expect(registered).toBe(true);
    });
  });

  describe("Simple Bind Authentication", () => {
    test("successful authentication returns user profile", async () => {
      // User scenario: User authenticates with valid credentials
      await ldap.registerTestUser("john", "secret123", {
        cn: "John Doe",
        mail: "john@example.com",
      });

      const result = await ldap.handleAuth({
        username: "john",
        password: "secret123",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.userId).toBe("john");
      expect(result.profile).toBeDefined();
      expect(result.profile.username).toBe("john");
      expect(result.profile.displayName).toBe("John Doe");
      expect(result.profile.email).toBe("john@example.com");
      expect(result.profile.dn).toContain("john");
    });

    test("authentication with invalid password fails", async () => {
      // User scenario: User enters wrong password
      await ldap.registerTestUser("jane", "correctpassword");

      const result = await ldap.handleAuth({
        username: "jane",
        password: "wrongpassword",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(result.error).toBe(LDAPError.INVALID_CREDENTIALS);
      expect(result.message).toContain("Invalid");
    });

    test("authentication with non-existent user fails", async () => {
      // User scenario: Someone tries to log in with unknown username
      const result = await ldap.handleAuth({
        username: "nonexistent",
        password: "anypassword",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(result.error).toBe(LDAPError.USER_NOT_FOUND);
      expect(result.message).toContain("not found");
    });

    test("authentication with missing credentials fails", async () => {
      // User scenario: Client sends request without username or password
      const noUsername = await ldap.handleAuth({ password: "pass" });
      expect(noUsername.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(noUsername.error).toBe(LDAPError.MISSING_CREDENTIALS);

      const noPassword = await ldap.handleAuth({ username: "user" });
      expect(noPassword.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(noPassword.error).toBe(LDAPError.MISSING_CREDENTIALS);

      const empty = await ldap.handleAuth({});
      expect(empty.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(empty.error).toBe(LDAPError.MISSING_CREDENTIALS);
    });
  });

  describe("Search-Then-Bind Mode", () => {
    test("search-then-bind mode authenticates with service account", async () => {
      // User scenario: Enterprise setup with service account for user search
      const ldapSearchBind = createLDAPStrategy({
        url: "ldap://localhost:389",
        baseDN: "ou=users,dc=example,dc=com",
        bindDN: "cn=admin,dc=example,dc=com",
        bindPassword: "adminpass",
      });

      // Register admin and user
      await ldapSearchBind.registerTestUser("admin", "adminpass");
      await ldapSearchBind.registerTestUser("employee", "emppass", {
        cn: "Employee Name",
        mail: "employee@corp.com",
      });

      const result = await ldapSearchBind.handleAuth({
        username: "employee",
        password: "emppass",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.userId).toBe("employee");
      expect(result.profile.displayName).toBe("Employee Name");

      ldapSearchBind.cleanup();
    });
  });

  describe("Group Membership", () => {
    test("returns group memberships from memberOf attribute", async () => {
      // User scenario: User with group memberships authenticates
      await ldap.registerTestUser("devuser", "devpass", {
        cn: "Dev User",
        memberOf: [
          "cn=developers,ou=groups,dc=example,dc=com",
          "cn=employees,ou=groups,dc=example,dc=com",
        ],
      });

      const result = await ldap.handleAuth({
        username: "devuser",
        password: "devpass",
      });

      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.profile.memberOf).toHaveLength(2);
      expect(result.profile.memberOf).toContain("cn=developers,ou=groups,dc=example,dc=com");
    });
  });

  describe("Passport.js Strategy Interface", () => {
    test("authenticate method calls success on valid credentials", async () => {
      // User scenario: Framework integrates LDAP as Passport.js strategy
      await ldap.registerTestUser("passportuser", "passportpass", {
        cn: "Passport User",
      });

      const mockReq = {
        username: "passportuser",
        password: "passportpass",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          success: (user, info) => resolve({ user, info }),
          fail: (info) => reject(new Error(info?.message || "Auth failed")),
          error: (err) => reject(err),
        };
        ldap.authenticate.call(context, mockReq);
      });

      const { user, info } = await successPromise;
      expect(user.username).toBe("passportuser");
      expect(info.userId).toBe("passportuser");
    });

    test("authenticate method calls fail on invalid credentials", async () => {
      // User scenario: Invalid credentials through Passport interface
      await ldap.registerTestUser("validuser", "validpass");

      const mockReq = {
        username: "validuser",
        password: "invalidpass",
      };

      const failPromise = new Promise((resolve) => {
        const context = {
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: (err) => resolve({ error: true, err }),
        };
        ldap.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.info.code).toBe(LDAPError.INVALID_CREDENTIALS);
    });

    test("authenticate method calls fail on missing credentials", async () => {
      // User scenario: Request missing username/password
      const mockReq = {};

      const failPromise = new Promise((resolve) => {
        const context = {
          success: () => resolve({ success: true }),
          fail: (info, status) => resolve({ fail: true, info, status }),
          error: (err) => resolve({ error: true, err }),
        };
        ldap.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.status).toBe(400);
    });

    test("authenticate with verify callback", async () => {
      // User scenario: Custom verify callback to transform/enrich user
      const ldapWithVerify = createLDAPStrategy(
        {
          url: "ldap://localhost",
          baseDN: "dc=example,dc=com",
        },
        (profile, done) => {
          // Transform LDAP profile to app user
          done(null, {
            id: profile.username,
            name: profile.displayName,
            roles: profile.groups,
          });
        }
      );

      await ldapWithVerify.registerTestUser("verifyuser", "verifypass", {
        cn: "Verify User",
      });

      const mockReq = {
        username: "verifyuser",
        password: "verifypass",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          success: (user, info) => resolve({ user, info }),
          fail: (info) => reject(new Error(info?.message || "Auth failed")),
          error: (err) => reject(err),
        };
        ldapWithVerify.authenticate.call(context, mockReq);
      });

      const { user } = await successPromise;
      expect(user.id).toBe("verifyuser");
      expect(user.name).toBe("Verify User");

      ldapWithVerify.cleanup();
    });

    test("authenticate with verify callback that rejects", async () => {
      // User scenario: Verify callback rejects the user (e.g., disabled account)
      const ldapWithReject = createLDAPStrategy(
        {
          url: "ldap://localhost",
          baseDN: "dc=example,dc=com",
        },
        (profile, done) => {
          // Reject even valid LDAP user
          done(null, false, { message: "Account disabled" });
        }
      );

      await ldapWithReject.registerTestUser("disableduser", "pass");

      const mockReq = {
        username: "disableduser",
        password: "pass",
      };

      const failPromise = new Promise((resolve) => {
        const context = {
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: (err) => resolve({ error: true, err }),
        };
        ldapWithReject.authenticate.call(context, mockReq);
      });

      const result = await failPromise;
      expect(result.fail).toBe(true);
      expect(result.info.message).toBe("Account disabled");

      ldapWithReject.cleanup();
    });

    test("authenticate with verify callback that errors", async () => {
      // User scenario: Verify callback throws an error
      const ldapWithError = createLDAPStrategy(
        {
          url: "ldap://localhost",
          baseDN: "dc=example,dc=com",
        },
        () => {
          throw new Error("Database connection failed");
        }
      );

      await ldapWithError.registerTestUser("erroruser", "pass");

      const mockReq = {
        username: "erroruser",
        password: "pass",
      };

      const errorPromise = new Promise((resolve) => {
        const context = {
          success: () => resolve({ success: true }),
          fail: (info) => resolve({ fail: true, info }),
          error: (err) => resolve({ error: true, err }),
        };
        ldapWithError.authenticate.call(context, mockReq);
      });

      const result = await errorPromise;
      expect(result.error).toBe(true);
      expect(result.err.message).toBe("Database connection failed");

      ldapWithError.cleanup();
    });

    test("authenticate with passReqToCallback option", async () => {
      // User scenario: Verify callback needs access to request object
      const ldapWithReq = createLDAPStrategy(
        {
          url: "ldap://localhost",
          baseDN: "dc=example,dc=com",
          passReqToCallback: true,
        },
        (req, profile, done) => {
          // Access request properties
          done(null, {
            id: profile.username,
            clientIP: req.clientIP,
          });
        }
      );

      await ldapWithReq.registerTestUser("requser", "pass");

      const mockReq = {
        username: "requser",
        password: "pass",
        clientIP: "192.168.1.100",
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          success: (user) => resolve(user),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        ldapWithReq.authenticate.call(context, mockReq);
      });

      const user = await successPromise;
      expect(user.id).toBe("requser");
      expect(user.clientIP).toBe("192.168.1.100");

      ldapWithReq.cleanup();
    });
  });

  describe("Strategy Aliasing", () => {
    test("LDAPStrategy is an alias for createLDAPStrategy", () => {
      // User scenario: Developer uses Passport.js style import
      expect(LDAPStrategy).toBe(createLDAPStrategy);

      const strategy = LDAPStrategy();
      expect(strategy.name).toBe("ldap");
      expect(typeof strategy.authenticate).toBe("function");
      strategy.cleanup();
    });
  });

  describe("Configuration Access", () => {
    test("exposes configuration for framework integration", () => {
      // User scenario: Framework needs to inspect adapter config
      const customLdap = createLDAPStrategy({
        url: "ldaps://secure.example.com:636",
        baseDN: "ou=people,dc=secure,dc=com",
        usernameField: "sAMAccountName",
      });

      expect(customLdap._config.url).toBe("ldaps://secure.example.com:636");
      expect(customLdap._config.baseDN).toBe("ou=people,dc=secure,dc=com");
      expect(customLdap._config.usernameField).toBe("sAMAccountName");

      customLdap.cleanup();
    });
  });

  describe("Multiple Independent Instances", () => {
    test("multiple LDAP instances are isolated", async () => {
      // User scenario: Application connects to multiple LDAP servers
      const ldap1 = createLDAPStrategy({ baseDN: "dc=corp1,dc=com" });
      const ldap2 = createLDAPStrategy({ baseDN: "dc=corp2,dc=com" });

      await ldap1.registerTestUser("user1", "pass1");
      await ldap2.registerTestUser("user2", "pass2");

      // User1 should only exist in ldap1
      const result1 = await ldap1.handleAuth({ username: "user1", password: "pass1" });
      expect(result1.type).toBe(LDAPMessageType.AUTH_OK);

      const result1in2 = await ldap2.handleAuth({ username: "user1", password: "pass1" });
      expect(result1in2.type).toBe(LDAPMessageType.AUTH_FAIL);

      // User2 should only exist in ldap2
      const result2 = await ldap2.handleAuth({ username: "user2", password: "pass2" });
      expect(result2.type).toBe(LDAPMessageType.AUTH_OK);

      ldap1.cleanup();
      ldap2.cleanup();
    });
  });

  describe("Body Parser Integration", () => {
    test("authenticate reads credentials from req.body", async () => {
      // User scenario: Credentials come from parsed request body
      await ldap.registerTestUser("bodyuser", "bodypass");

      const mockReq = {
        body: {
          username: "bodyuser",
          password: "bodypass",
        },
      };

      const successPromise = new Promise((resolve, reject) => {
        const context = {
          success: (user) => resolve(user),
          fail: (info) => reject(new Error(info?.message)),
          error: (err) => reject(err),
        };
        ldap.authenticate.call(context, mockReq);
      });

      const user = await successPromise;
      expect(user.username).toBe("bodyuser");
    });
  });
});
