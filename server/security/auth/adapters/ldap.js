/**
 * @fileoverview LDAP Authentication Adapter for api-ape Server
 *
 * Implements LDAP/Active Directory authentication for enterprise integration.
 * This is a Tier 1 adapter providing primary identity verification.
 *
 * ## Protocol Flow
 *
 * ```
 * Client                           Server
 *   |-- ldap_auth ---------------->|  (username, password)
 *   |<- ldap_auth_ok / _fail ------|  (principal / error)
 * ```
 *
 * ## Features
 *
 * - Simple bind authentication
 * - Search-then-bind for flexible user lookup
 * - Group membership extraction for role mapping
 * - Connection pooling support
 * - TLS/STARTTLS support
 * - Passport.js Strategy interface compatibility
 *
 * @module server/security/auth/adapters/ldap
 * @see {@link module:server/security/auth} for the auth framework
 */

"use strict";

const { LDAPMessageType, LDAPError } = require("./ldap/constants");
const { createDefaultStorage, createMockLDAPClient } = require("./ldap/helpers");

/**
 * Create an LDAP authentication adapter
 *
 * @param {LDAPConfig} [config={}] - Configuration options
 * @param {Function} [verify] - Passport.js verify callback
 * @returns {Object} LDAP adapter with Passport.js Strategy interface
 *
 * @example
 * // Basic usage
 * const ldap = createLDAPStrategy({
 *   url: 'ldap://ldap.example.com',
 *   baseDN: 'ou=users,dc=example,dc=com'
 * });
 *
 * // With verify callback (Passport.js style)
 * const ldap = createLDAPStrategy({
 *   url: 'ldaps://ldap.example.com',
 *   baseDN: 'ou=users,dc=example,dc=com',
 *   bindDN: 'cn=admin,dc=example,dc=com',
 *   bindPassword: 'secret'
 * }, (profile, done) => {
 *   User.findOrCreate({ ldapId: profile.dn }, done);
 * });
 */
function createLDAPStrategy(config = {}, verify = null) {
  // Handle Passport.js style: (verify) or (config, verify)
  if (typeof config === "function") {
    verify = config;
    config = {};
  }

  // Create per-instance storage for isolation
  const instanceStorage = createDefaultStorage();

  const {
    url = "ldap://localhost:389",
    baseDN = "dc=example,dc=com",
    bindDN = null,
    bindPassword = null,
    searchFilter = "(uid={{username}})",
    usernameField = "uid",
    groupSearchBase = null,
    groupSearchFilter = "(member={{dn}})",
    groupAttribute = "cn",
    tlsOptions = null,
    timeout = 5000,
    connectTimeout = 10000,
    passReqToCallback = false,
    ldapClient = null,
    getUser = instanceStorage.getUser,
    saveUser = instanceStorage.saveUser,
  } = config;

  const storage = { getUser, saveUser };

  // Create or use provided LDAP client
  const client = ldapClient || createMockLDAPClient(storage);

  // Passport.js Strategy interface
  const strategy = {
    name: "ldap",
  };

  /**
   * Perform user search
   * @private
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User entry or null
   */
  async function searchUser(username) {
    const filter = searchFilter.replace(/\{\{username\}\}/g, username);
    const results = await client.search(baseDN, {
      filter,
      scope: "sub",
      attributes: ["dn", usernameField, "cn", "mail", "memberOf"],
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get group memberships for a user
   * @private
   * @param {string} userDN - User's distinguished name
   * @returns {Promise<string[]>} Array of group names
   */
  async function getGroups(userDN) {
    if (!groupSearchBase) return [];

    const bases = Array.isArray(groupSearchBase) ? groupSearchBase : [groupSearchBase];
    const groups = [];

    for (const base of bases) {
      const filter = groupSearchFilter.replace(/\{\{dn\}\}/g, userDN);
      const results = await client.search(base, {
        filter,
        scope: "sub",
        attributes: [groupAttribute],
      });
      for (const entry of results) {
        if (entry[groupAttribute]) {
          groups.push(entry[groupAttribute]);
        }
      }
    }

    return groups;
  }

  /**
   * Handle LDAP authentication message
   *
   * @param {Object} data - Message data
   * @param {string} data.username - Username
   * @param {string} data.password - Password
   * @returns {Promise<Object>} Response message
   */
  async function handleAuth(data) {
    const { username, password } = data;

    if (!username || !password) {
      return {
        type: LDAPMessageType.AUTH_FAIL,
        error: LDAPError.MISSING_CREDENTIALS,
        message: "Username and password are required",
      };
    }

    try {
      let userEntry;
      let userDN;

      // Search-then-bind mode (more flexible)
      if (bindDN) {
        // First bind as service account
        await client.bind(bindDN, bindPassword);

        // Search for user
        userEntry = await searchUser(username);
        if (!userEntry) {
          return {
            type: LDAPMessageType.AUTH_FAIL,
            error: LDAPError.USER_NOT_FOUND,
            message: "User not found",
          };
        }
        userDN = userEntry.dn;

        // Rebind as user to verify password
        await client.bind(userDN, password);
      } else {
        // Simple bind mode - construct DN from username
        userDN = `${usernameField}=${username},${baseDN}`;
        await client.bind(userDN, password);

        // Optionally search for additional user info
        userEntry = await searchUser(username);
      }

      // Get group memberships
      const groups = userEntry ? await getGroups(userEntry.dn || userDN) : [];

      // Build profile
      const profile = {
        dn: userDN,
        username: userEntry?.[usernameField] || username,
        displayName: userEntry?.cn || username,
        email: userEntry?.mail,
        groups,
        memberOf: userEntry?.memberOf || [],
        raw: userEntry,
      };

      return {
        type: LDAPMessageType.AUTH_OK,
        userId: username,
        profile,
        groups,
      };
    } catch (err) {
      // Map LDAP errors to our error codes
      let errorCode = LDAPError.BIND_ERROR;
      let message = err.message || "Authentication failed";

      if (err.code === "LDAP_INVALID_CREDENTIALS" || err.message?.includes("Invalid credentials")) {
        errorCode = LDAPError.INVALID_CREDENTIALS;
        message = "Invalid username or password";
      } else if (err.code === "LDAP_NO_SUCH_OBJECT" || err.message?.includes("not found")) {
        errorCode = LDAPError.USER_NOT_FOUND;
        message = "User not found";
      } else if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
        errorCode = LDAPError.CONNECTION_ERROR;
        message = "Could not connect to LDAP server";
      } else if (err.code === "ENOTFOUND") {
        errorCode = LDAPError.SERVER_UNAVAILABLE;
        message = "LDAP server unavailable";
      }

      return {
        type: LDAPMessageType.AUTH_FAIL,
        error: errorCode,
        message,
      };
    }
  }

  /**
   * Passport.js authenticate method
   *
   * @param {Object} req - Request object with username/password
   * @param {Object} [options] - Authentication options
   */
  strategy.authenticate = function (req, options = {}) {
    const self = this;
    const username = req.username || req.body?.username;
    const password = req.password || req.body?.password;

    if (!username || !password) {
      return self.fail({ message: "Missing credentials" }, 400);
    }

    handleAuth({ username, password })
      .then((result) => {
        if (result.type === LDAPMessageType.AUTH_FAIL) {
          return self.fail({ message: result.message, code: result.error });
        }

        // Call verify callback if provided (Passport.js pattern)
        if (verify) {
          /**
           * Passport.js verified callback
           * @param {Error|null} err - Error if verification failed
           * @param {Object|false} user - User object or false
           * @param {Object} [info] - Additional info
           * @returns {void}
           */
          const verified = (err, user, info) => {
            if (err) return self.error(err);
            if (!user) return self.fail(info || { message: "Verification failed" });
            return self.success(user, info);
          };

          try {
            if (passReqToCallback) {
              verify(req, result.profile, verified);
            } else {
              verify(result.profile, verified);
            }
          } catch (err) {
            return self.error(err);
          }
        } else {
          // No verify callback, return profile directly
          return self.success(result.profile, { userId: result.userId });
        }
      })
      .catch((err) => {
        if (typeof self.error === "function") {
          self.error(err);
        }
      });
  };

  /**
   * Register a test user (for mock mode)
   *
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {Object} [attributes={}] - Additional attributes
   * @returns {Promise<boolean>} Success
   */
  async function registerTestUser(username, password, attributes = {}) {
    return storage.saveUser(username, {
      password,
      cn: attributes.cn || username,
      mail: attributes.mail || `${username}@example.com`,
      memberOf: attributes.memberOf || [],
      attributes,
    });
  }

  /**
   * Cleanup resources
   */
  function cleanup() {
    if (client.destroy) {
      client.destroy();
    }
  }

  return {
    // Passport.js Strategy interface
    name: strategy.name,
    authenticate: strategy.authenticate,

    // Direct message handlers
    handleAuth,

    // Test utilities
    registerTestUser,

    // Lifecycle
    cleanup,

    // Config access (for framework integration)
    _config: {
      url,
      baseDN,
      usernameField,
    },
  };
}

// Passport.js style alias
const LDAPStrategy = createLDAPStrategy;

module.exports = {
  createLDAPStrategy,
  LDAPStrategy,
  LDAPMessageType,
  LDAPError,
};
