/**
 * Delay Controller - Returns after a configurable delay
 *
 * Used for testing async controller behavior and timeout handling.
 *
 * @module test-api/delay
 */

/**
 * Wait for specified milliseconds then return the data
 *
 * @param {Object} data - Request data
 * @param {number} [data.ms=100] - Delay in milliseconds
 * @returns {Promise<Object>} The input data after delay
 */
module.exports = async function (data) {
  const delay = data?.ms || 100;

  await new Promise((resolve) => setTimeout(resolve, delay));

  return {
    delayed: true,
    ms: delay,
    ...data
  };
};
