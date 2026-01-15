const upload = require('./upload');

/**
 * Upload multiple files in sequence
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Upload endpoint
 * @param {Array<{filename: string, data: Buffer}>} options.files - Files to upload
 * @param {number} [options.timeout=5000] - Timeout per file (ms)
 * @returns {Promise<Array<any>>} Array of upload results
 *
 * @example
 * const results = await uploadMany({
 *   client,
 *   endpoint: 'files/upload',
 *   files: [
 *     { filename: 'a.txt', data: Buffer.from('content a') },
 *     { filename: 'b.txt', data: Buffer.from('content b') }
 *   ]
 * })
 */
async function uploadMany({ client, endpoint, files, timeout = 5000 }) {
  if (!Array.isArray(files)) {
    throw new Error('uploadMany: files array required');
  }

  const results = [];
  for (const file of files) {
    const result = await upload({
      client,
      endpoint,
      filename: file.filename,
      data: file.data,
      metadata: file.metadata,
      timeout,
    });
    results.push(result);
  }
  return results;
}

module.exports = uploadMany;
