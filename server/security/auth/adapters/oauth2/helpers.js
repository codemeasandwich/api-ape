/**
 * @fileoverview OAuth2 Helpers
 * @module server/security/auth/adapters/oauth2/helpers
 */

"use strict";

const crypto = require("crypto");

/**
 * Create per-instance storage for mock mode
 * @returns {Object} Storage adapter with isolated maps
 */
function createDefaultStorage() {
  const pendingStates = new Map();
  const mockUsers = new Map();
  const mockTokens = new Map();
  return {
    /**
     * Store pending OAuth2 state
     * @param {string} state - State parameter
     * @param {Object} data - State data
     * @returns {Promise<boolean>} Success
     */
    async saveState(state, data) {
      pendingStates.set(state, { ...data, createdAt: Date.now() });
      return true;
    },
    /**
     * Get pending OAuth2 state
     * @param {string} state - State parameter
     * @returns {Promise<Object|null>} State data or null
     */
    async getState(state) {
      return pendingStates.get(state) || null;
    },
    /**
     * Delete pending OAuth2 state
     * @param {string} state - State parameter
     * @returns {Promise<boolean>} Success
     */
    async deleteState(state) {
      return pendingStates.delete(state);
    },
    /**
     * Register mock user for testing
     * @param {string} userId - User ID
     * @param {Object} profile - User profile
     * @returns {Promise<boolean>} Success
     */
    async registerMockUser(userId, profile) {
      const token = "mock_token_" + crypto.randomBytes(8).toString("hex");
      mockUsers.set(userId, profile);
      mockTokens.set(token, userId);
      return true;
    },
    /**
     * Get mock user by token
     * @param {string} token - Access token
     * @returns {Promise<Object|null>} User profile or null
     */
    async getMockUserByToken(token) {
      const userId = mockTokens.get(token);
      return userId ? mockUsers.get(userId) : null;
    },
    /**
     * Get mock user by ID
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User profile or null
     */
    async getMockUser(userId) {
      return mockUsers.get(userId) || null;
    },
    /**
     * Create mock token for user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Token response
     */
    async createMockToken(userId) {
      const token = "mock_token_" + crypto.randomBytes(8).toString("hex");
      const refreshToken = "mock_refresh_" + crypto.randomBytes(8).toString("hex");
      mockTokens.set(token, userId);
      return {
        access_token: token,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
      };
    },
  };
}

/**
 * Generate random state parameter
 * @returns {string} State string
 */
function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate PKCE code verifier
 * @returns {string} Code verifier
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate PKCE code challenge from verifier
 * @param {string} verifier - Code verifier
 * @returns {string} Code challenge
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

module.exports = {
  createDefaultStorage,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
};
