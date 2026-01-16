/**
 * Binary Upload Controller - Tests binary tag upload system
 *
 * This controller tests the `<!B>` and `<!A>` tag system for binary uploads.
 * When a client sends a message with tagged keys, the server expects
 * the binary data to be uploaded via HTTP PUT.
 *
 * @module test-api/binary-upload
 */

/**
 * Handle binary upload via tag system
 *
 * The client sends: { "file<!B>": "hash123", name: "test" }
 * Then uploads binary data via HTTP PUT to /api/ape/data/:queryId/:hash123
 * The server cleans the tags and injects the actual data.
 *
 * @param {Object} data - Request data with binary fields
 * @param {Buffer} [data.file] - Binary file data (after tag processing)
 * @param {string} [data.name] - File name
 * @returns {Object} Upload result
 */
module.exports = function(data) {
    const result = {
        success: true,
        received: {}
    };

    // Check what we received
    if (data) {
        // List all received fields and their types
        for (const [key, value] of Object.entries(data)) {
            if (Buffer.isBuffer(value)) {
                result.received[key] = {
                    type: 'Buffer',
                    length: value.length,
                    preview: value.slice(0, 20).toString('hex')
                };
            } else if (value instanceof ArrayBuffer) {
                result.received[key] = {
                    type: 'ArrayBuffer',
                    length: value.byteLength
                };
            } else {
                result.received[key] = {
                    type: typeof value,
                    value: value
                };
            }
        }
    }

    return result;
};
