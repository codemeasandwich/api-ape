/**
 * @file User Create Controller - Tests send-to-all functionality
 */

/**
 * Create a user and notify all connected clients
 *
 * @param {Object} data - User data
 * @returns {Object} Success response with user data
 */
module.exports = function(data) {
    // Send to all connected clients
    this.clients.forEach((client) => {
        client.send('test-broadcast', {
            action: 'user-created',
            user: data
        });
    });

    return {
        success: true,
        user: data
    };
};
