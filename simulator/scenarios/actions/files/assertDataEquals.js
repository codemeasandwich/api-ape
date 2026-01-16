/**
 * Assert file data matches expected
 *
 * @param {Object} options - Options
 * @param {Buffer|ArrayBuffer} options.actual - Actual data
 * @param {Buffer|ArrayBuffer} options.expected - Expected data
 * @returns {void}
 */
function assertDataEquals({ actual, expected }) {
  let actualBuffer = actual;
  let expectedBuffer = expected;

  if (actual instanceof ArrayBuffer) {
    actualBuffer = Buffer.from(actual);
  }
  if (expected instanceof ArrayBuffer) {
    expectedBuffer = Buffer.from(expected);
  }

  if (!Buffer.isBuffer(actualBuffer)) {
    throw new Error(`assertDataEquals: actual is not a Buffer (got ${typeof actual})`);
  }
  if (!Buffer.isBuffer(expectedBuffer)) {
    throw new Error(`assertDataEquals: expected is not a Buffer (got ${typeof expected})`);
  }

  if (actualBuffer.length !== expectedBuffer.length) {
    throw new Error(
      `assertDataEquals: length mismatch (actual: ${actualBuffer.length}, expected: ${expectedBuffer.length})`
    );
  }

  if (!actualBuffer.equals(expectedBuffer)) {
    throw new Error('assertDataEquals: buffer contents do not match');
  }
}

module.exports = assertDataEquals;
