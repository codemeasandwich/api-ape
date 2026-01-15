/**
 * Assert file size is within expected range
 *
 * @param {Object} options - Options
 * @param {Buffer|ArrayBuffer} options.data - File data
 * @param {number} [options.minBytes] - Minimum size
 * @param {number} [options.maxBytes] - Maximum size
 * @param {number} [options.exactBytes] - Exact size
 * @returns {void}
 */
function assertSize({ data, minBytes, maxBytes, exactBytes }) {
  let size;
  if (Buffer.isBuffer(data)) {
    size = data.length;
  } else if (data instanceof ArrayBuffer) {
    size = data.byteLength;
  } else if (ArrayBuffer.isView(data)) {
    size = data.byteLength;
  } else {
    throw new Error(`assertSize: data is not a buffer type (got ${typeof data})`);
  }

  if (exactBytes !== undefined && size !== exactBytes) {
    throw new Error(`assertSize: expected exactly ${exactBytes} bytes but got ${size}`);
  }

  if (minBytes !== undefined && size < minBytes) {
    throw new Error(`assertSize: expected at least ${minBytes} bytes but got ${size}`);
  }

  if (maxBytes !== undefined && size > maxBytes) {
    throw new Error(`assertSize: expected at most ${maxBytes} bytes but got ${size}`);
  }
}

module.exports = assertSize;
