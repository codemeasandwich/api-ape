/**
 * Runtime Detection Controller - Tests wsProvider runtime detection
 *
 * Provides endpoints to test and override runtime detection for coverage.
 *
 * @module test-api/runtime
 */

const wsProvider = require('../../server/lib/wsProvider');

/**
 * Get current runtime information and provider details
 *
 * Also supports broadcast action for testing this.broadcast()
 *
 * @param {Object} data - Request data
 * @param {Object} [data.override] - Runtime override to set before checking
 * @param {string} [data.action] - Action to perform ('broadcast')
 * @param {string} [data.type] - Message type for broadcast
 * @param {any} [data.data] - Data for broadcast
 * @returns {Object} Runtime and provider information or broadcast result
 */
module.exports = function(data) {
    // Handle broadcast action - tests receive.js line 238
    if (data?.action === 'broadcast') {
        this.broadcast(data.type || 'runtime-broadcast', data.data || {});
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
