/**
 * Nested Index Controller - Tests directory index resolution
 * 
 * Maps to: api.nested() (index.js maps to parent directory)
 * Tests that index.js files correctly map to their parent directory.
 * 
 * @module test-api/nested
 */

/**
 * Handler for nested directory index
 * 
 * @param {Object} data - Request data
 * @returns {Object} Response confirming index resolution
 */
module.exports = function (data) {
    return {
        type: 'index',
        path: 'nested',
        message: 'Nested index handler reached',
        data: data,
        clientId: this.clientId
    };
};
