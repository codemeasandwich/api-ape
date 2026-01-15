/**
 * Deep Nested Controller - Tests deep route resolution
 * 
 * Maps to: api.nested.deep.handler()
 * Tests that deeply nested routes are correctly resolved.
 * 
 * @module test-api/nested/deep/handler
 */

/**
 * Handler for deep nested route test
 * 
 * @param {Object} data - Request data
 * @param {string} [data.message] - Optional message
 * @returns {Object} Response with depth info
 */
module.exports = function (data) {
    return {
        depth: 3,
        path: 'nested/deep/handler',
        message: data?.message || 'Deep handler reached',
        clientId: this.clientId
    };
};
