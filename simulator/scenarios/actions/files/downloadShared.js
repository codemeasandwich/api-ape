/**
 * Verify a receiver can download a shared file
 *
 * @param {Object} options - Options
 * @param {Object} options.receiver - Client that should download
 * @param {string} options.endpoint - Download endpoint
 * @param {string} options.fileHash - Hash/ID of shared file
 * @param {Buffer} [options.expectedData] - Expected content (if known)
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<Object>} Downloaded file data
 */
async function downloadShared({ receiver, endpoint, fileHash, expectedData, timeout = 5000 }) {
  if (!receiver) {
    throw new Error('downloadShared: receiver client required');
  }

  const result = await receiver.call(endpoint, { hash: fileHash }, { timeout });

  if (expectedData) {
    const downloadedBuffer = Buffer.isBuffer(result.data)
      ? result.data
      : Buffer.from(result.data);
    const expectedBuffer = Buffer.isBuffer(expectedData)
      ? expectedData
      : Buffer.from(expectedData);

    if (!downloadedBuffer.equals(expectedBuffer)) {
      throw new Error('downloadShared: downloaded data does not match expected');
    }
  }

  return result;
}

module.exports = downloadShared;
