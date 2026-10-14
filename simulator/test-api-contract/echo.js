/**
 * @fileoverview Returns what it is given, wrapped, so a story can tell replies apart.
 *
 * @module simulator/test-api-contract/echo
 */

/**
 * Echo the payload back.
 *
 * @param {any} data - Anything JSS can carry
 * @returns {{echo: any}} The payload under `echo`
 */
module.exports = function echo(data) {
  return { echo: data };
};
