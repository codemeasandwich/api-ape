/**
 * @fileoverview Test endpoint fixture for schema introspection tests
 * @module server/lib/schema/__fixtures__/test-endpoint
 */

/**
 * Test endpoint for schema tests
 *
 * @param {object} input - Test input
 * @param {string} input.name - Name parameter
 * @returns {object} Test response
 */
module.exports = function testEndpoint({ name }) {
  return { greeting: `Hello, ${name}` };
};
