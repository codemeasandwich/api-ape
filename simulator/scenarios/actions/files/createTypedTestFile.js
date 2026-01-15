/**
 * Create a test file with specific MIME type signature
 *
 * @param {Object} options - Options
 * @param {string} options.type - File type: 'png', 'jpeg', 'gif', 'pdf', 'text'
 * @param {number} [options.sizeBytes=100] - Total size
 * @returns {{data: Buffer, filename: string, contentType: string}}
 *
 * @example
 * const png = createTypedTestFile({ type: 'png', sizeBytes: 500 })
 */
function createTypedTestFile({ type, sizeBytes = 100 }) {
  const signatures = {
    png: {
      magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      ext: 'png',
      contentType: 'image/png',
    },
    jpeg: {
      magic: [0xFF, 0xD8, 0xFF, 0xE0],
      ext: 'jpg',
      contentType: 'image/jpeg',
    },
    gif: {
      magic: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
      ext: 'gif',
      contentType: 'image/gif',
    },
    pdf: {
      magic: [0x25, 0x50, 0x44, 0x46, 0x2D],
      ext: 'pdf',
      contentType: 'application/pdf',
    },
    text: {
      magic: [],
      ext: 'txt',
      contentType: 'text/plain',
    },
  };

  const sig = signatures[type];
  if (!sig) {
    throw new Error(`createTypedTestFile: unknown type '${type}'`);
  }

  const buffer = Buffer.alloc(Math.max(sizeBytes, sig.magic.length));

  // Write magic bytes
  for (let i = 0; i < sig.magic.length; i++) {
    buffer[i] = sig.magic[i];
  }

  // Fill rest with random data
  for (let i = sig.magic.length; i < sizeBytes; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  return {
    data: buffer,
    filename: `test.${sig.ext}`,
    contentType: sig.contentType,
  };
}

module.exports = createTypedTestFile;
