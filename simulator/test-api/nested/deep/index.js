/**
 * Deep Index Controller - Tests nested directory index resolution
 * 
 * Maps to: api.nested.deep() 
 * Tests that index.js in a nested directory correctly maps to its parent path.
 * 
 * @module test-api/nested/deep
 */

/**
 * Handler for deep nested directory index
 * 
 * @param {Object} data - Request data  
 * @returns {Object} Response confirming deep index resolution
 */
module.exports = function (data) {
    return {
        type: 'index',
        depth: 2,
        path: 'nested/deep',
        message: 'Nested deep index handler reached',
        data: data,
        clientId: this.clientId
    };
};
