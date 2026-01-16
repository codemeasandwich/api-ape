/**
 * Create test file data with specific characteristics
 *
 * @param {Object} options - Options
 * @param {number} options.sizeBytes - Size of file in bytes
 * @param {string} [options.pattern='random'] - Fill pattern: 'random', 'zeros', 'sequential'
 * @returns {Buffer} Generated test data
 *
 * @example
 * const largeFile = createTestData({ sizeBytes: 1024 * 1024 }) // 1MB
 * const smallFile = createTestData({ sizeBytes: 100, pattern: 'sequential' })
 */
function createTestData({ sizeBytes, pattern = 'random' }) {
  if (!sizeBytes || sizeBytes < 1) {
    throw new Error('createTestData: sizeBytes must be >= 1');
  }

  const buffer = Buffer.alloc(sizeBytes);

  switch (pattern) {
    case 'zeros':
      // Buffer is already zeros
      break;

    case 'sequential':
      for (let i = 0; i < sizeBytes; i++) {
        buffer[i] = i % 256;
      }
      break;

    case 'random':
    default:
      for (let i = 0; i < sizeBytes; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      break;
  }

  return buffer;
}

module.exports = createTestData;
