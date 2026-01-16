const call = require('./call');

/**
 * Make an RPC call and expect it to throw an error
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {string|RegExp} [options.errorMatch] - Error message match
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<Error>} The thrown error
 *
 * @example
 * const err = await callAndExpectError({
 *   client,
 *   endpoint: 'errors',
 *   data: { type: 'generic', message: 'Test' },
 *   errorMatch: /Test/
 * })
 */
async function callAndExpectError({ client, endpoint, data = {}, errorMatch, timeout = 1000 }) {
  try {
    await call({ client, endpoint, data, timeout });
    throw new Error(`callAndExpectError: expected error but call succeeded`);
  } catch (err) {
    if (err.message === 'callAndExpectError: expected error but call succeeded') {
      throw err;
    }

    if (errorMatch) {
      if (typeof errorMatch === 'string') {
        if (!err.message.includes(errorMatch)) {
          throw new Error(
            `callAndExpectError: expected error containing '${errorMatch}' but got '${err.message}'`
          );
        }
      } else if (errorMatch instanceof RegExp) {
        if (!errorMatch.test(err.message)) {
          throw new Error(
            `callAndExpectError: expected error matching ${errorMatch} but got '${err.message}'`
          );
        }
      }
    }

    return err;
  }
}

module.exports = callAndExpectError;
