/**
 * User Profile Controller - Returns user profile with embedded context
 *
 * Tests nested route resolution and this.* context access.
 *
 * @module test-api/users/profile
 */

/**
 * Get user profile with controller context
 *
 * Demonstrates access to embedded values and controller context.
 *
 * @param {Object} [data] - Request data
 * @param {number} [data.id] - User ID to look up
 * @returns {Object} User profile with context info
 */
module.exports = function (data) {
    return {
        // Request data
        requestedId: data?.id,

        // Controller context from this.*
        clientId: this.clientId,
        sessionId: this.sessionId || null,

        // Embedded values (set via onConnect)
        userId: this.userId || null,
        role: this.role || null,

        // Mock profile data
        profile: {
            id: data?.id || 1,
            name: 'Test User',
            createdAt: new Date()
        }
    };
};
