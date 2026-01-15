/**
 * File Download Controller - Serves binary file data
 *
 * Tests Buffer return handling via api-ape file transfer system.
 *
 * @module test-api/files/download
 */

const { _uploads } = require('./upload');

/**
 * Download a previously uploaded file
 *
 * @param {Object} data - Download request
 * @param {string} data.hash - File hash from upload
 * @returns {Object} File data with name and binary content
 */
module.exports = function (data) {
    if (!data?.hash) {
        throw new Error('No file hash provided');
    }

    const file = _uploads.get(data.hash);

    if (!file) {
        throw new Error(`File not found: ${data.hash}`);
    }

    return {
        name: file.name,
        data: file.data, // Buffer - will be encoded by api-ape
        size: file.size,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy
    };
};
