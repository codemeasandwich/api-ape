/**
 * Users Index Controller - Returns list of mock users
 *
 * Tests nested route resolution (users/index.js → api.users())
 *
 * @module test-api/users
 */

// Mock user data store
const _users = [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
    { id: 3, name: 'Charlie', role: 'user' }
];

/**
 * Get list of users
 *
 * @param {Object} [data] - Optional filters
 * @param {string} [data.role] - Filter by role
 * @returns {Object} List of users
 */
module.exports = function (data) {
    let users = [..._users];

    // Optional role filter
    if (data?.role) {
        users = users.filter((u) => u.role === data.role);
    }

    return {
        users,
        total: users.length,
        requestedBy: this.clientId
    };
};

// Export for testing
module.exports._users = _users;
