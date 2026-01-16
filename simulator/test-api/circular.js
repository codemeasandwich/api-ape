/**
 * Circular Reference Controller - Tests JSS circular reference handling
 * 
 * Tests the Pointer (P) tag encoding/decoding for circular references.
 * 
 * @module test-api/circular
 */

/**
 * Return data with circular reference
 * 
 * @param {Object} data - Request data
 * @returns {Object} Object with circular reference
 */
module.exports = function (data) {
    // Create an object with a circular reference
    const result = {
        name: data?.name || 'root',
        value: data?.value || 42,
        children: []
    };

    // Add circular reference: child points back to parent
    const child = {
        name: 'child',
        parent: result  // Circular reference!
    };

    result.children.push(child);

    // Try to detect if we're testing self-reference
    if (data?.selfRef) {
        result.self = result;  // Self-reference
    }

    return result;
};
