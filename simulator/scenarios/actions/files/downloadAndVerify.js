const download = require('./download');

/**
 * Download and verify file matches expected content
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Download endpoint
 * @param {string} [options.filename] - Filename to request
 * @param {Buffer} options.expectedData - Expected binary content
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<Object>} Downloaded file data
 *
 * @example
 * await downloadAndVerify({
 *   client,
 *   endpoint: 'files/download',
 *   filename: 'test.txt',
 *   expectedData: Buffer.from('expected content')
 * })
 */
async function downloadAndVerify({ client, endpoint, filename, expectedData, timeout = 5000 }) {
  const result = await download({ client, endpoint, filename, timeout });

  const actualData = result.data;
  if (!actualData) {
    throw new Error('downloadAndVerify: response missing data property');
  }

  // Convert to Buffer for comparison
  let actualBuffer = actualData;
  if (actualData instanceof ArrayBuffer) {
    actualBuffer = Buffer.from(actualData);
  }

  let expectedBuffer = expectedData;
  if (expectedData instanceof ArrayBuffer) {
    expectedBuffer = Buffer.from(expectedData);
  }

  if (!Buffer.isBuffer(actualBuffer)) {
    throw new Error(`downloadAndVerify: expected Buffer but got ${typeof actualData}`);
  }

  if (!actualBuffer.equals(expectedBuffer)) {
    throw new Error(
      `downloadAndVerify: data mismatch (got ${actualBuffer.length} bytes, expected ${expectedBuffer.length} bytes)`
    );
  }

  return result;
}

module.exports = downloadAndVerify;
