/**
 * @file SAML helper functions
 */
"use strict";

const crypto = require("crypto");

/**
 * Create per-instance storage for mock mode
 * @returns {Object} Storage adapter with isolated maps
 */
function createDefaultStorage() {
  const pendingRequests = new Map();
  const mockUsers = new Map();
  return {
    /**
     * Save a pending SAML request
     * @param {string} requestId - Request ID
     * @param {Object} data - Request data
     * @returns {Promise<boolean>} Success
     */
    async savePendingRequest(requestId, data) {
      pendingRequests.set(requestId, { ...data, createdAt: Date.now() });
      return true;
    },
    /**
     * Get a pending SAML request
     * @param {string} requestId - Request ID
     * @returns {Promise<Object|null>} Request data or null
     */
    async getPendingRequest(requestId) {
      return pendingRequests.get(requestId) || null;
    },
    /**
     * Delete a pending SAML request
     * @param {string} requestId - Request ID
     * @returns {Promise<boolean>} Success
     */
    async deletePendingRequest(requestId) {
      return pendingRequests.delete(requestId);
    },
    /**
     * Register a mock user for testing
     * @param {string} nameId - User name ID
     * @param {Object} attributes - User attributes
     * @returns {Promise<boolean>} Success
     */
    async registerMockUser(nameId, attributes) {
      mockUsers.set(nameId, attributes);
      return true;
    },
    /**
     * Get a mock user by name ID
     * @param {string} nameId - User name ID
     * @returns {Promise<Object|null>} User attributes or null
     */
    async getMockUser(nameId) {
      return mockUsers.get(nameId) || null;
    },
  };
}

/**
 * Generate a SAML AuthnRequest ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return "_" + crypto.randomBytes(16).toString("hex");
}

module.exports = {
  createDefaultStorage,
  generateRequestId,
};
