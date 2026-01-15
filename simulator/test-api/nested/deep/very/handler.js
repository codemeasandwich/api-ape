/**
 * Very Deep Nested Controller - Tests very deep route resolution
 * 
 * Maps to: api.nested.deep.very.handler()
 * Tests that very deeply nested routes (4 levels) are correctly resolved.
 * 
 * @module test-api/nested/deep/very/handler
 */

/**
 * Handler for very deep nested route test
 * 
 * @param {Object} data - Request data
 * @param {string} [data.message] - Optional message
 * @returns {Object} Response with depth info
 */
module.exports = function (data) {
    return {
        depth: 4,
        path: 'nested/deep/very/handler',
        message: data?.message || 'Very deep handler reached',
        clientId: this.clientId
    };
};
