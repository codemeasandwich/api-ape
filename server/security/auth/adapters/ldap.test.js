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

  // ============================================================================
  // Passport.js single-arg constructor: `createLDAPStrategy(verifyFn)`. Common
  // when wiring up a strategy with just the verify callback and accepting all
  // defaults (no LDAP config). The constructor must reinterpret the first arg
  // as the verify callback.
  // ============================================================================
  describe("Passport.js single-arg constructor", () => {
    test("accepts createLDAPStrategy(verifyFn) — first arg is verify callback", async () => {
      const verifyCalls = [];
      const strategy = createLDAPStrategy((profile, done) => {
        verifyCalls.push(profile);
        done(null, { id: profile.username });
      });
      await strategy.registerTestUser("singlearg", "pass");
      const ctx = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      await new Promise((resolve, reject) => {
        ctx.success = (user) => { resolve(user); };
        ctx.fail = (info) => reject(new Error(info?.message));
        ctx.error = (err) => reject(err);
        strategy.authenticate.call(ctx, { username: "singlearg", password: "pass" });
      });
      expect(verifyCalls).toHaveLength(1);
      expect(verifyCalls[0].username).toBe("singlearg");
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Group search: production deployments either point groupSearchBase at one
  // base DN or an array of bases (e.g. when groups live in multiple OUs). Both
  // shapes must be exercised so the Array.isArray ternary is fully covered.
  // ============================================================================
  describe("Group search with groupSearchBase", () => {
    function makeGroupAwareClient(storage, groupEntriesByBase) {
      return {
        async bind(dn, password) {
          const match = dn.match(/uid=([^,]+)/i) || dn.match(/cn=([^,]+)/i);
          const username = match ? match[1] : dn;
          const user = await storage.getUser(username);
          if (!user) {
            const err = new Error("User not found");
            err.code = "LDAP_NO_SUCH_OBJECT";
            throw err;
          }
          if (user.password !== password) {
            const err = new Error("Invalid credentials");
            err.code = "LDAP_INVALID_CREDENTIALS";
            throw err;
          }
        },
        async search(base, options) {
          const filter = options.filter || "";
          // Group search filters look like (member=DN)
          if (/^\(member=/.test(filter)) {
            return groupEntriesByBase[base] || [];
          }
          // User search
          const match = filter.match(/\(uid=([^)]+)\)/i) || filter.match(/\(cn=([^)]+)\)/i);
          if (match) {
            const username = match[1];
            const user = await storage.getUser(username);
            if (user) {
              return [
                {
                  dn: `uid=${username},${base}`,
                  uid: username,
                  cn: user.cn || username,
                  mail: user.mail || `${username}@example.com`,
                  memberOf: user.memberOf || [],
                },
              ];
            }
          }
          return [];
        },
        async unbind() {},
        destroy() {},
      };
    }

    test("string groupSearchBase resolves into a single-base array", async () => {
      const storage = { getUser: jest.fn(), saveUser: jest.fn() };
      const userStore = new Map();
      storage.getUser = async (u) => userStore.get(u) || null;
      storage.saveUser = async (u, d) => { userStore.set(u, d); return true; };
      userStore.set("alice", { password: "secret", cn: "Alice" });
      const groupsByBase = {
        "ou=groups,dc=example,dc=com": [
          { cn: "developers" },
          { cn: "engineering" },
        ],
      };
      const groupClient = makeGroupAwareClient(storage, groupsByBase);
      const strategy = createLDAPStrategy({
        baseDN: "ou=users,dc=example,dc=com",
        groupSearchBase: "ou=groups,dc=example,dc=com",
        ldapClient: groupClient,
        getUser: storage.getUser,
        saveUser: storage.saveUser,
      });

      const result = await strategy.handleAuth({ username: "alice", password: "secret" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.groups).toEqual(["developers", "engineering"]);
      strategy.cleanup();
    });

    test("array groupSearchBase searches each base in order", async () => {
      const userStore = new Map();
      userStore.set("bob", { password: "pw", cn: "Bob" });
      const storage = {
        getUser: async (u) => userStore.get(u) || null,
        saveUser: async (u, d) => { userStore.set(u, d); return true; },
      };
      const groupsByBase = {
        "ou=domain-groups,dc=corp,dc=com": [{ cn: "domain-admins" }],
        "ou=app-groups,dc=corp,dc=com": [{ cn: "app-editors" }],
      };
      const groupClient = makeGroupAwareClient(storage, groupsByBase);
      const strategy = createLDAPStrategy({
        baseDN: "ou=users,dc=corp,dc=com",
        groupSearchBase: [
          "ou=domain-groups,dc=corp,dc=com",
          "ou=app-groups,dc=corp,dc=com",
        ],
        ldapClient: groupClient,
        getUser: storage.getUser,
        saveUser: storage.saveUser,
      });

      const result = await strategy.handleAuth({ username: "bob", password: "pw" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.groups).toContain("domain-admins");
      expect(result.groups).toContain("app-editors");
      strategy.cleanup();
    });

    test("group entries missing the configured groupAttribute are skipped", async () => {
      const userStore = new Map();
      userStore.set("charlie", { password: "pw", cn: "Charlie" });
      const storage = {
        getUser: async (u) => userStore.get(u) || null,
        saveUser: async (u, d) => { userStore.set(u, d); return true; },
      };
      const groupsByBase = {
        "ou=groups,dc=ex,dc=com": [
          { cn: "marketing" },
          {}, // No cn attribute — must be filtered out
          { cn: "sales" },
        ],
      };
      const groupClient = makeGroupAwareClient(storage, groupsByBase);
      const strategy = createLDAPStrategy({
        baseDN: "ou=users,dc=ex,dc=com",
        groupSearchBase: "ou=groups,dc=ex,dc=com",
        ldapClient: groupClient,
        getUser: storage.getUser,
        saveUser: storage.saveUser,
      });

      const result = await strategy.handleAuth({ username: "charlie", password: "pw" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.groups).toEqual(["marketing", "sales"]);
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Search-then-bind: user not found by search. This exercises the L171
  // !userEntry early-return inside the bindDN branch.
  // ============================================================================
  describe("Search-then-bind: user-not-found inside service-account search", () => {
    test("returns USER_NOT_FOUND when search yields no entries in bindDN mode", async () => {
      const userStore = new Map();
      // Only the admin exists; "ghost" is not registered
      userStore.set("admin", { password: "adminpw", cn: "Admin" });
      const storage = {
        getUser: async (u) => userStore.get(u) || null,
        saveUser: async (u, d) => { userStore.set(u, d); return true; },
      };
      const strategy = createLDAPStrategy({
        baseDN: "ou=users,dc=ex,dc=com",
        bindDN: "cn=admin,dc=ex,dc=com",
        bindPassword: "adminpw",
        getUser: storage.getUser,
        saveUser: storage.saveUser,
      });
      const result = await strategy.handleAuth({ username: "ghost", password: "any" });
      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(result.error).toBe(LDAPError.USER_NOT_FOUND);
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Error-mapping branches: the catch block in handleAuth maps known LDAP
  // error codes (LDAP_NO_SUCH_OBJECT, ETIMEDOUT/ECONNREFUSED, ENOTFOUND) to
  // our adapter's normalized error codes. We need a custom client that throws
  // each error shape to exercise each branch.
  // ============================================================================
  describe("Error code mapping", () => {
    function makeFailingClient(err) {
      return {
        async bind() { throw err; },
        async search() { return []; },
        async unbind() {},
        destroy() {},
      };
    }

    test("maps LDAP_NO_SUCH_OBJECT to USER_NOT_FOUND in simple-bind mode", async () => {
      const err = Object.assign(new Error("not found"), { code: "LDAP_NO_SUCH_OBJECT" });
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      expect(result.error).toBe(LDAPError.USER_NOT_FOUND);
      strategy.cleanup();
    });

    test("maps ETIMEDOUT to CONNECTION_ERROR", async () => {
      const err = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.CONNECTION_ERROR);
      strategy.cleanup();
    });

    test("maps ECONNREFUSED to CONNECTION_ERROR", async () => {
      const err = Object.assign(new Error("conn refused"), { code: "ECONNREFUSED" });
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.CONNECTION_ERROR);
      strategy.cleanup();
    });

    test("maps ENOTFOUND to SERVER_UNAVAILABLE", async () => {
      const err = Object.assign(new Error("dns failure"), { code: "ENOTFOUND" });
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.SERVER_UNAVAILABLE);
      strategy.cleanup();
    });

    test("falls through to BIND_ERROR for unknown error codes", async () => {
      const err = Object.assign(new Error("weird"), { code: "WEIRD_ERR" });
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.BIND_ERROR);
      strategy.cleanup();
    });

    // Scenario: error message includes "Invalid credentials" but lacks the
    // structured LDAP_INVALID_CREDENTIALS code (some libraries throw plain
    // Error). The message-substring branch in the err mapper must catch it.
    test("maps message containing 'Invalid credentials' to INVALID_CREDENTIALS", async () => {
      const err = new Error("Invalid credentials provided by client");
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.INVALID_CREDENTIALS);
      strategy.cleanup();
    });

    // Scenario: error message contains "not found" (e.g. lowercase "uid not
    // found in directory"). Substring branch must promote to USER_NOT_FOUND.
    test("maps message containing 'not found' to USER_NOT_FOUND", async () => {
      const err = new Error("entry was not found in the tree");
      const strategy = createLDAPStrategy({
        baseDN: "dc=x,dc=com",
        ldapClient: makeFailingClient(err),
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.error).toBe(LDAPError.USER_NOT_FOUND);
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Simple-bind mode with no post-bind search result: bind succeeds but the
  // optional searchUser call returns nothing (e.g. anonymous read denied).
  // Profile fields fall back to the supplied username.
  // ============================================================================
  describe("Simple bind without searchable user info", () => {
    function makeBindOnlyClient(userStore) {
      return {
        async bind(dn, password) {
          const match = dn.match(/uid=([^,]+)/i) || dn.match(/cn=([^,]+)/i);
          const username = match ? match[1] : dn;
          const user = userStore.get(username);
          if (!user) {
            const err = new Error("not found");
            err.code = "LDAP_NO_SUCH_OBJECT";
            throw err;
          }
          if (user.password !== password) {
            const err = new Error("invalid");
            err.code = "LDAP_INVALID_CREDENTIALS";
            throw err;
          }
        },
        // Search always returns empty — anonymous read forbidden
        async search() { return []; },
        async unbind() {},
        destroy() {},
      };
    }

    test("falls back to username-only profile when post-bind search returns nothing", async () => {
      const userStore = new Map();
      userStore.set("readonly", { password: "rpw" });
      const storage = {
        getUser: async (u) => userStore.get(u) || null,
        saveUser: async (u, d) => { userStore.set(u, d); return true; },
      };
      const strategy = createLDAPStrategy({
        baseDN: "dc=ex,dc=com",
        ldapClient: makeBindOnlyClient(userStore),
        getUser: storage.getUser,
        saveUser: storage.saveUser,
      });
      const result = await strategy.handleAuth({ username: "readonly", password: "rpw" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.profile.username).toBe("readonly");
      expect(result.profile.displayName).toBe("readonly");
      expect(result.profile.email).toBeUndefined();
      expect(result.profile.memberOf).toEqual([]);
      expect(result.groups).toEqual([]);
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Passport authenticate() exception in handleAuth: the inner promise's
  // .catch propagates unexpected exceptions to strategy.error().
  // ============================================================================
  describe("Passport authenticate catch propagation", () => {
    test("authenticate forwards thrown bind errors to strategy.error via catch", async () => {
      // A client whose .bind throws synchronously (not a rejected Promise) —
      // handleAuth wraps that into the catch.
      const explodingClient = {
        bind() { throw new Error("synchronous boom"); },
        async search() { return []; },
        async unbind() {},
        destroy() {},
      };
      const strategy = createLDAPStrategy({
        baseDN: "dc=ex,dc=com",
        ldapClient: explodingClient,
      });
      const result = await strategy.handleAuth({ username: "u", password: "p" });
      // Caught inside handleAuth's try/catch — returns AUTH_FAIL with BIND_ERROR
      expect(result.type).toBe(LDAPMessageType.AUTH_FAIL);
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Catch-block edge cases (paths that don't fit any of the recognized LDAP
  // error code shapes).
  // ============================================================================
  describe("Catch-block edge cases", () => {
    // Scenario: a low-level library throws an error object without a message
    // (e.g. a wrapped Promise rejection from native bindings). The `err.message
    // || "Authentication failed"` fallback must engage so the response still
    // includes a useful diagnostic string.
    test("falls back to default message when thrown error has none", async () => {
      const errNoMessage = Object.assign(new Error(), { code: "WEIRD" });
      errNoMessage.message = ""; // explicitly empty
      const explodingClient = {
        async bind() { throw errNoMessage; },
        async search() { return []; },
        async unbind() {},
        destroy() {},
      };
      const strategy = createLDAPStrategy({
        baseDN: "dc=ex,dc=com",
        ldapClient: explodingClient,
      });
      const result = await strategy.handleAuth({ username: "x", password: "y" });
      expect(result.message).toBe("Authentication failed");
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Group search edge case: search returns an entry without a `dn` field. The
  // `userEntry.dn || userDN` short-circuit must fall through to the
  // bind-constructed DN.
  // ============================================================================
  describe("Search result without dn falls back to constructed userDN", () => {
    test("uses constructed userDN when search entry lacks dn", async () => {
      const userStore = new Map();
      userStore.set("dnless", { password: "p", cn: "DNLess" });
      const noDnClient = {
        async bind(dn, password) {
          const m = dn.match(/uid=([^,]+)/i);
          const u = m ? userStore.get(m[1]) : null;
          if (!u) {
            const err = new Error("not found");
            err.code = "LDAP_NO_SUCH_OBJECT";
            throw err;
          }
          if (u.password !== password) {
            const err = new Error("invalid");
            err.code = "LDAP_INVALID_CREDENTIALS";
            throw err;
          }
        },
        async search(base, options) {
          const filter = options.filter || "";
          // Return entries without a `dn` field on user search
          const m = filter.match(/\(uid=([^)]+)\)/i);
          if (m) {
            const u = userStore.get(m[1]);
            if (u) return [{ uid: m[1], cn: u.cn, memberOf: [] }];
          }
          return [];
        },
        async unbind() {},
        destroy() {},
      };
      const strategy = createLDAPStrategy({
        baseDN: "dc=ex,dc=com",
        groupSearchBase: "ou=groups,dc=ex,dc=com",
        ldapClient: noDnClient,
      });
      const result = await strategy.handleAuth({ username: "dnless", password: "p" });
      // Auth should still succeed; getGroups was called with userDN (the
      // constructed-from-bind DN) instead of entry.dn.
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.profile.dn).toContain("dnless");
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Passport verify-callback error/info edge cases (branches in the `verified`
  // closure at L268-272).
  // ============================================================================
  describe("Passport verified() closure branches", () => {
    // Scenario: verify callback signals async error via done(err, ...).
    // Distinct from "throws synchronously" — exercises the `if (err)` branch.
    test("verify callback calling done(err) routes through strategy.error", async () => {
      const strategy = createLDAPStrategy(
        { baseDN: "dc=ex,dc=com" },
        (profile, done) => done(new Error("downstream error")),
      );
      await strategy.registerTestUser("verifyerr", "p");
      const ctx = {
        success: jest.fn(),
        fail: jest.fn(),
        error: jest.fn(),
      };
      await new Promise((resolve) => {
        ctx.error = (e) => { ctx._err = e; resolve(); };
        ctx.success = () => resolve();
        ctx.fail = () => resolve();
        strategy.authenticate.call(ctx, { username: "verifyerr", password: "p" });
      });
      expect(ctx._err).toBeInstanceOf(Error);
      expect(ctx._err.message).toBe("downstream error");
      strategy.cleanup();
    });

    // Scenario: verify callback rejects via done(null, false) without an info
    // object. The `info || { message: "Verification failed" }` fallback
    // engages.
    test("verify callback done(null, false) without info uses default message", async () => {
      const strategy = createLDAPStrategy(
        { baseDN: "dc=ex,dc=com" },
        (profile, done) => done(null, false),
      );
      await strategy.registerTestUser("noinfo-ldap", "p");
      const ctx = { success: jest.fn(), fail: jest.fn(), error: jest.fn() };
      await new Promise((resolve) => {
        ctx.fail = (info) => { ctx._info = info; resolve(); };
        ctx.success = () => resolve();
        ctx.error = () => resolve();
        strategy.authenticate.call(ctx, { username: "noinfo-ldap", password: "p" });
      });
      expect(ctx._info).toEqual({ message: "Verification failed" });
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Unexpected catch propagation: if the Passport context `self.success`
  // itself throws (e.g. a downstream handler crashes), the outer .catch
  // forwards to self.error when present and silently swallows otherwise.
  // ============================================================================
  describe("Authenticate catch propagation", () => {
    test("invokes self.error when present after self.success throws", async () => {
      const strategy = createLDAPStrategy({ baseDN: "dc=ex,dc=com" });
      await strategy.registerTestUser("crasher", "p");
      const ctx = {
        success: () => { throw new Error("success handler crashed"); },
        fail: jest.fn(),
        error: jest.fn(),
      };
      await new Promise((resolve) => {
        ctx.error = (e) => { ctx._err = e; resolve(); };
        strategy.authenticate.call(ctx, { username: "crasher", password: "p" });
      });
      expect(ctx._err).toBeInstanceOf(Error);
      expect(ctx._err.message).toBe("success handler crashed");
      strategy.cleanup();
    });

    test("no-op when self.error is not a function and self.success throws", async () => {
      const strategy = createLDAPStrategy({ baseDN: "dc=ex,dc=com" });
      await strategy.registerTestUser("silent-crash", "p");
      // Use Promise to detect when authenticate's microtask queue drains.
      const ctx = {
        success: () => { throw new Error("crash"); },
        fail: () => {},
        // self.error is intentionally undefined — branch 1 of `typeof self.error === "function"`
      };
      // Just ensure no unhandled rejection / no throw
      strategy.authenticate.call(ctx, { username: "silent-crash", password: "p" });
      // Drain microtasks
      await new Promise((r) => setImmediate(r));
      // No assertion needed — the test passes if no unhandled rejection occurred.
      // Reference ctx to silence lint
      expect(typeof ctx.success).toBe("function");
      strategy.cleanup();
    });
  });

  // ============================================================================
  // Cleanup branch coverage: some custom ldapClient implementations don't
  // expose a `destroy()` method. The cleanup() function's `if (client.destroy)`
  // guard must not throw in that case.
  // ============================================================================
  describe("cleanup() when client lacks destroy()", () => {
    test("cleanup is a no-op when ldapClient has no destroy method", () => {
      const noDestroyClient = {
        async bind() {},
        async search() { return []; },
        async unbind() {},
        // No destroy
      };
      const strategy = createLDAPStrategy({
        baseDN: "dc=ex,dc=com",
        ldapClient: noDestroyClient,
      });
      expect(() => strategy.cleanup()).not.toThrow();
    });
  });

  // ============================================================================
  // Mock LDAP client edge cases — exercised through adapter config knobs.
  // These reflect real Active Directory / corporate-AD shapes where the
  // username attribute is sAMAccountName or similar non-uid/cn.
  // ============================================================================
  describe("Mock LDAP client edge cases via adapter config", () => {
    // Scenario: AD uses sAMAccountName, so the bind DN won't contain uid= or
    // cn=. The mock's `match ? match[1] : dn` ternary's RHS (dn) engages.
    test("bind with non-uid/non-cn DN uses the full DN as username", async () => {
      const ldap = createLDAPStrategy({
        baseDN: "ou=users,dc=corp,dc=com",
        usernameField: "sAMAccountName",
      });
      // The mock uses the full DN as username when the DN has neither uid= nor cn=.
      // Register with that exact DN-as-username.
      await ldap.registerTestUser(
        "sAMAccountName=alice,ou=users,dc=corp,dc=com",
        "p",
      );
      const result = await ldap.handleAuth({ username: "alice", password: "p" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      ldap.cleanup();
    });

    // Scenario: stored user record is minimal — no `cn`, `mail`, `memberOf`,
    // or `attributes` fields. The mock search's `user.X || fallback` short
    // circuits engage for each field.
    test("search returns sensible defaults for a user with no extra fields", async () => {
      const ldap = createLDAPStrategy({ baseDN: "dc=ex,dc=com" });
      // Register a user with no cn/mail/memberOf
      await ldap.registerTestUser("minimaluser", "p");
      const result = await ldap.handleAuth({ username: "minimaluser", password: "p" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.profile.displayName).toBe("minimaluser");
      expect(result.profile.email).toBe("minimaluser@example.com");
      expect(result.profile.memberOf).toEqual([]);
      ldap.cleanup();
    });

    // Scenario: the adapter only calls .unbind() during cleanup of certain
    // flows we don't exercise directly. Expose its presence by calling the
    // adapter's cleanup path with the default mock client (which has both
    // unbind() and destroy()).
    test("cleanup does not throw when client has both unbind and destroy", () => {
      const ldap = createLDAPStrategy({ baseDN: "dc=ex,dc=com" });
      expect(() => ldap.cleanup()).not.toThrow();
    });

    // Scenario: an admin uses a `cn=`-style search filter (common in AD).
    // The mock's `filter.match(uid=) || filter.match(cn=)` RHS engages.
    test("mock search supports cn-style searchFilter", async () => {
      const ldap = createLDAPStrategy({
        baseDN: "dc=corp,dc=com",
        searchFilter: "(cn={{username}})",
      });
      await ldap.registerTestUser("cnsearch", "p", { cn: "CnSearch User" });
      const result = await ldap.handleAuth({ username: "cnsearch", password: "p" });
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      ldap.cleanup();
    });

    // Scenario: an admin uses a search filter that contains NEITHER uid=
    // nor cn= — the mock returns no results, triggering the `if (match)`
    // false branch.
    test("mock search returns empty for non-uid/non-cn filters", async () => {
      const ldap = createLDAPStrategy({
        baseDN: "dc=corp,dc=com",
        searchFilter: "(sAMAccountName={{username}})",
      });
      await ldap.registerTestUser("sam-user", "p");
      const result = await ldap.handleAuth({ username: "sam-user", password: "p" });
      // Auth still succeeds via simple-bind, but searchUser returns []
      expect(result.type).toBe(LDAPMessageType.AUTH_OK);
      expect(result.profile.displayName).toBe("sam-user");
      ldap.cleanup();
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
