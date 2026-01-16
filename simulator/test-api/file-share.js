/**
 * File Share Controller - Tests F-tag pass-through in responses
 *
 * Returns data with <!F> tagged keys to test the send.js pass-through
 * logic. This simulates a controller that prepares file sharing data
 * for client-to-client transfer.
 *
 * @module test-api/file-share
 */

/**
 * Generate file sharing response with F-tagged keys
 *
 * @param {Object} data - Request data
 * @param {string} data.fileHash - Hash to use for the file reference
 * @param {string} [data.fileName] - Optional file name
 * @returns {Object} Response with F-tagged file reference
 */
module.exports = function(data) {
    const { fileHash, fileName } = data || {};

    if (!fileHash) {
        return {
            error: 'fileHash is required'
        };
    }

    // Return data with <!F> tag in the key
    // This triggers send.js lines 284-286 (F-tag pass-through)
    const response = {
        success: true,
        fileName: fileName || 'shared-file.dat',
        // The <!F> tag tells the client to fetch this from /api/ape/data/:hash
        ['fileRef<!F>']: fileHash
    };

    return response;
};
