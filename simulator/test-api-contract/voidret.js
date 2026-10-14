/**
 * @fileoverview Controllers that return nothing: the caller must still get a reply.
 *
 * @module simulator/test-api-contract/voidret
 */

/**
 * Return nothing (an async controller, as most real ones are).
 *
 * @returns {Promise<void>} Resolves with `undefined`
 */
module.exports = async function voidret() {
  await new Promise((resolve) => setTimeout(resolve, 10));
};
