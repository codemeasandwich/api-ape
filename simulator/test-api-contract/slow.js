/**
 * @fileoverview Long-running controller that sends `this.keepalive()` after each round.
 *
 * Used by the call-contract stories: a keepalive frame must carry THIS call's queryId
 * and must never be mistaken for the reply.
 *
 * @module simulator/test-api-contract/slow
 */

/**
 * Work for `n` rounds of `ms` milliseconds, sending a keepalive after each round.
 *
 * @param {{n: number, ms: number, tag: string}} input - Rounds, round length, caller label
 * @returns {Promise<{done: boolean, tag: string, rounds: number}>} The final result
 */
module.exports = async function slow({ n, ms, tag }) {
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    this.keepalive();
  }
  return { done: true, tag, rounds: n };
};
