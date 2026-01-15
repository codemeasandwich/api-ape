/**
 * Errors Controller - Deliberately throws errors for testing
 *
 * Used for testing error handling, error serialization, and
 * error recovery scenarios.
 *
 * @module test-api/errors
 */

/**
 * Throw various types of errors based on request
 *
 * @param {Object} data - Request data
 * @param {string} [data.type='generic'] - Error type: 'generic', 'custom', 'async', 'timeout'
 * @param {string} [data.message] - Custom error message
 * @throws {Error} Always throws an error
 */
module.exports = async function (data) {
    const type = data?.type || 'generic';
    const message = data?.message || 'Test error';

    switch (type) {
        case 'custom':
            const customError = new Error(message);
            customError.code = 'CUSTOM_ERROR';
            customError.details = data.details || {};
            throw customError;

        case 'async':
            await new Promise((resolve) => setTimeout(resolve, 10));
            throw new Error(`Async error: ${message}`);

        case 'validation':
            const validationError = new Error(message);
            validationError.code = 'VALIDATION_ERROR';
            validationError.field = data.field || 'unknown';
            throw validationError;

        case 'generic':
        default:
            throw new Error(message);
    }
};
