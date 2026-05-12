/**
 * @fileoverview LDAP Helpers
 * @module server/security/auth/adapters/ldap/helpers
 */

"use strict";

/**
 * Create per-instance storage for mock mode
 * @returns {Object} Storage adapter with isolated user map
 */
function createDefaultStorage() {
  const userStore = new Map();
  return {
    /**
     * Get user by username
     * @param {string} username - Username to look up
     * @returns {Promise<Object|null>} User object or null
     */
    async getUser(username) {
      return userStore.get(username) || null;
    },
    /**
     * Save user (for mock registration)
     * @param {string} username - Username
     * @param {Object} userData - User data including password hash
     * @returns {Promise<boolean>} Success
     */
    async saveUser(username, userData) {
      userStore.set(username, userData);
      return true;
    },
  };
}

/**
 * Create mock LDAP client for testing
 * @param {Object} storage - Storage adapter
 * @returns {Object} Mock LDAP client
 */
function createMockLDAPClient(storage) {
  return {
    /**
     * Mock bind operation
     * @param {string} dn - Distinguished name
     * @param {string} password - Password
     * @returns {Promise<void>}
     */
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

    /**
     * Mock search operation
     * @param {string} base - Search base DN
     * @param {Object} options - Search options
     * @returns {Promise<Object[]>} Search results
     */
    async search(base, options) {
      const results = [];
      // DEAD `|| ""`: every caller (LDAP adapter's searchUser + getGroups)
      // builds and passes an explicit `filter`. To be removed at step 7.
      const filter = options.filter /* || "" */;

      const match = filter.match(/\(uid=([^)]+)\)/i) || filter.match(/\(cn=([^)]+)\)/i);
      if (match) {
        const username = match[1];
        const user = await storage.getUser(username);
        if (user) {
          // DEAD fallback short-circuits below: registerTestUser always sets
          // cn, mail, memberOf for the user record (see ldap.js:303-310).
          // To be removed at step 7.
          results.push({
            dn: `uid=${username},${base}`,
            uid: username,
            cn: user.cn /* || username */,
            mail: user.mail /* || `${username}@example.com` */,
            memberOf: user.memberOf /* || [] */,
            ...user.attributes,
          });
        }
      }
      return results;
    },

    // DEAD: the LDAP adapter never invokes `unbind` on the mock client (only
    // `bind`, `search`, `destroy` are used). To be removed at step 7.
    // /**
    //  * Mock unbind operation
    //  * @returns {Promise<void>}
    //  */
    // async unbind() {},

    /**
     * Mock destroy operation
     * @returns {void}
     */
    destroy() {},
  };
}

module.exports = {
  createDefaultStorage,
  createMockLDAPClient,
};
