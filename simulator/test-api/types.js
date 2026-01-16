/**
 * Types Controller - JSS type round-trip testing
 *
 * Returns the input data unchanged, demonstrating that JSS encoding
 * preserves complex types through the WebSocket transport.
 *
 * @module test-api/types
 */

/**
 * Echo back data with complex types
 *
 * Supports: Date, RegExp, Error, Set, Map, undefined
 *
 * @param {Object} data - Data containing various types
 * @returns {Object} The same data, proving types survive round-trip
 */
module.exports = function (data) {
    // Add server timestamp to prove we processed it
    return {
        ...data,
        serverTimestamp: new Date()
    };
};
