/**
 * @file Runtime Detection Controller - Tests wsProvider runtime detection
 *
 * Provides endpoints to test and override runtime detection for coverage.
 *
 * @module test-api/runtime
 */

const wsProvider = require('../../server/lib/wsProvider');

/**
 * Get current runtime information and provider details
 *
 * Also supports sendToAll action for testing this.clients
 *
 * @param {Object} data - Request data
 * @param {Object} [data.override] - Runtime override to set before checking
 * @param {string} [data.action] - Action to perform ('broadcast' sends to all)
 * @param {string} [data.type] - Message type for send
 * @param {any} [data.data] - Data for send
 * @returns {Object} Runtime and provider information or send result
 */
module.exports = function(data) {
    // Handle send-to-all action - sends to all connected clients
    if (data?.action === 'broadcast') {
        const type = data.type || 'runtime-broadcast';
        const payload = data.data || {};
        this.clients.forEach((client) => {
            client.send(type, payload);
        });
        return { broadcasted: true, type: data.type };
    }

    // If override is provided, set it first
    if (data?.override !== undefined) {
        wsProvider._setRuntimeOverride(data.override);
    }

    // Get runtime information
    const runtime = wsProvider.getRuntime();
    const isDeno = wsProvider.isDeno();
    const isBun = wsProvider.isBun();
    const isNode24 = wsProvider.isNode24Stable();

    // Get provider (this may change based on override)
    const provider = wsProvider.getWebSocketProvider();

    return {
        runtime,
        isDeno,
        isBun,
        isNode24,
        provider: {
            type: provider.type,
            runtime: provider.runtime,
            hasWebSocketServer: !!provider.WebSocketServer
        },
        currentOverride: wsProvider._getRuntimeOverride()
    };
};

/**
 * Reset runtime override to default (actual detection)
 */
module.exports.reset = function() {
    wsProvider._setRuntimeOverride(null);
    return { reset: true };
};
