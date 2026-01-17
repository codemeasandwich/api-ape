/**
 * @file File Upload Controller - Handles binary file uploads
 *
 * Tests binary data handling via api-ape file transfer system.
 *
 * @module test-api/files/upload
 */

const crypto = require('crypto');

// Store uploaded files in memory (for testing only)
const _uploads = new Map();

/**
 * Handle file upload
 *
 * @param {Object} data - Upload data
 * @param {string} data.name - Filename
 * @param {Buffer} data.data - File binary data
 * @returns {Object} Upload result with hash and metadata
 */
module.exports = function (data) {
    if (!data?.data) {
        throw new Error('No file data provided');
    }

    let buffer;
    if (Buffer.isBuffer(data.data)) {
        buffer = data.data;
    } else if (Array.isArray(data.data)) {
        buffer = Buffer.from(data.data);
    } else if (typeof data.data === 'object') {
        // JSS serializes Buffer as object with numeric keys: {0: 72, 1: 101, ...}
        // Convert to array first
        const keys = Object.keys(data.data).map(Number).sort((a, b) => a - b);
        const bytes = keys.map((k) => data.data[k]);
        buffer = Buffer.from(bytes);
    } else {
        buffer = Buffer.from(data.data);
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Store the file
    _uploads.set(hash, {
        name: data.name || 'unnamed',
        data: buffer,
        size: buffer.length,
        uploadedAt: new Date(),
        uploadedBy: this.clientId
    });

    // Send to others that a file was shared
    if (data.broadcast !== false) {
        this.clients.forEach((client) => {
            if (client.clientId !== this.clientId) {
                client.sendTo('file-shared', {
                    hash,
                    name: data.name,
                    size: buffer.length,
                    from: this.clientId
                });
            }
        });
    }

    return {
        success: true,
        hash,
        name: data.name,
        size: buffer.length
    };
};

// Export for testing and download controller
module.exports._uploads = _uploads;

// Reset function for test cleanup
module.exports._reset = function () {
    _uploads.clear();
};
