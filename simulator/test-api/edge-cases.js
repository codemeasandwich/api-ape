/**
 * Edge Cases Controller - Supports various edge case scenarios
 *
 * This controller allows testing different return types and behaviors
 * that a real developer might use in their application.
 *
 * @module test-api/edge-cases
 */

/**
 * Handle edge case test actions
 *
 * Real-world scenarios:
 * - return-undefined: Controller that performs side effects but doesn't return data
 * - return-null-buffer: Controller returning a form with optional file field left empty
 * - return-raw-buffer: Controller returning raw binary content (like an image generator)
 * - nested-file-tag: Controller returning file references nested in a response object
 *
 * @param {Object} data - Request data
 * @param {string} data.action - Action to perform
 * @returns {any} Result depends on action
 */
module.exports = function(data) {
    switch(data?.action) {
        case 'return-undefined':
            // Scenario: Controller performs logging/analytics but returns nothing
            // A real app might do this for fire-and-forget operations
            console.log('Edge case: fire-and-forget action executed');
            return;

        case 'return-null-buffer':
            // Scenario: Form submission where optional file fields are empty
            // A real app returns { avatar: null } when user didn't upload a profile pic
            return { file: null, buffer: undefined, name: 'test' };

        case 'return-raw-buffer':
            // Scenario: Image generator or binary data processor
            // A real app might return raw Buffer for generated thumbnails
            return Buffer.from('raw binary data from controller');

        case 'return-raw-buffer-array':
            // Scenario: Batch image processor returning multiple results
            return [
                Buffer.from('buffer-1'),
                Buffer.from('buffer-2'),
                Buffer.from('buffer-3')
            ];

        case 'nested-file-tag':
            // Scenario: Document management system returning file references
            // nested inside a response structure
            return {
                success: true,
                attachments: {
                    ['doc<!F>']: data?.hash || 'test-file-hash'
                }
            };

        case 'deep-nested-file-tag':
            // Scenario: Complex API response with deeply nested file refs
            return {
                result: {
                    files: {
                        primary: {
                            ['content<!F>']: data?.hash || 'deep-hash'
                        }
                    }
                }
            };

        default:
            return { received: data, action: data?.action || 'none' };
    }
};
