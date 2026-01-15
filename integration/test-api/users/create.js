/**
 * User Create Controller - Tests broadcast functionality
 */
module.exports = function(data) {
    // Broadcast to all clients
    this.broadcast('test-broadcast', {
        action: 'user-created',
        user: data
    });

    return {
        success: true,
        user: data
    };
};
