/**
 * Broadcast Test Controller - Tests broadcast.js proxy traps
 *
 * Provides endpoints to test the ape.clients proxy behavior,
 * including mutation prevention and method forwarding.
 *
 * The controller context (`this`) contains the `clients` proxy map
 * along with other utility functions and values.
 *
 * @module test-api/broadcast-test
 */

/**
 * Test the clients proxy behavior
 *
 * @this {Object} Controller context with clients map
 * @param {Object} data - Request data
 * @param {string} [data.action] - Action to test: 'size', 'forEach', 'get', 'has', 'keys', 'values', 'entries', 'mutate'
 * @returns {Object} Test results
 */
module.exports = function(data) {
    // Access clients from controller context (this)
    const clients = this.clients;
    const action = data?.action || 'size';

    const result = {
        action,
        success: true
    };

    try {
        switch (action) {
            case 'size':
                // Test size property access
                result.size = clients.size;
                result.sizeType = typeof clients.size;
                break;

            case 'forEach':
                // Test forEach method (should be bound correctly)
                const clientIds = [];
                clients.forEach((wrapper, id) => {
                    clientIds.push({
                        id,
                        hasClientId: typeof wrapper.clientId === 'string',
                        hasSendTo: typeof wrapper.sendTo === 'function'
                    });
                });
                result.clients = clientIds;
                result.count = clientIds.length;
                break;

            case 'get':
                // Test get method
                const firstKey = clients.keys().next().value;
                if (firstKey) {
                    const client = clients.get(firstKey);
                    result.clientId = client?.clientId;
                    result.hasEmbed = !!client?.embed;
                }
                result.hasClient = !!firstKey;
                break;

            case 'has':
                // Test has method
                const checkKey = clients.keys().next().value;
                result.hasFirst = checkKey ? clients.has(checkKey) : null;
                result.hasNonExistent = clients.has('non-existent-id');
                break;

            case 'keys':
                // Test keys iterator
                result.keys = [...clients.keys()];
                break;

            case 'values':
                // Test values iterator
                const values = [...clients.values()];
                result.values = values.map(v => ({
                    clientId: v.clientId,
                    hasEmbed: !!v.embed
                }));
                break;

            case 'entries':
                // Test entries iterator
                const entries = [...clients.entries()];
                result.entries = entries.map(([k, v]) => ({
                    key: k,
                    clientId: v.clientId
                }));
                break;

            case 'sessionId':
                // Test sessionId getter on client wrapper
                const sessionClient = clients.values().next().value;
                if (sessionClient) {
                    result.sessionId = sessionClient.sessionId;
                    result.hasSessionId = sessionClient.sessionId !== null;
                }
                break;

            case 'agent':
                // Test agent getter on client wrapper
                const agentClient = clients.values().next().value;
                if (agentClient) {
                    result.agent = agentClient.agent;
                    result.hasAgent = !!agentClient.agent;
                    result.agentKeys = Object.keys(agentClient.agent);
                }
                break;

            case 'sendTo':
                // Test sendTo method on client wrapper
                const sendClient = clients.values().next().value;
                if (sendClient) {
                    // Send a test message to self
                    sendClient.sendTo('broadcast-test-ping', { timestamp: Date.now() });
                    result.sentMessage = true;
                }
                break;

            case 'mutate-set':
                // Test that set is blocked
                try {
                    clients.set('test-id', { fake: true });
                    result.success = false;
                    result.error = 'set should have thrown';
                } catch (err) {
                    result.mutationBlocked = true;
                    result.errorMessage = err.message;
                }
                break;

            case 'mutate-delete':
                // Test that delete is blocked
                try {
                    clients.delete('some-id');
                    result.success = false;
                    result.error = 'delete should have thrown';
                } catch (err) {
                    result.mutationBlocked = true;
                    result.errorMessage = err.message;
                }
                break;

            case 'mutate-clear':
                // Test that clear is blocked
                try {
                    clients.clear();
                    result.success = false;
                    result.error = 'clear should have thrown';
                } catch (err) {
                    result.mutationBlocked = true;
                    result.errorMessage = err.message;
                }
                break;

            default:
                result.success = false;
                result.error = `Unknown action: ${action}`;
        }
    } catch (err) {
        result.success = false;
        result.error = err.message;
    }

    return result;
};
