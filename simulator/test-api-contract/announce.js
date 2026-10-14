/**
 * @fileoverview Controllers that push to other clients through the controller context.
 *
 * @module simulator/test-api-contract/announce
 */

/**
 * Push `shout` to EVERY connected client, then `whisper` to everyone EXCEPT the caller.
 *
 * @param {{text: string}} input - What to announce
 * @returns {string} `"announced"`
 */
module.exports = function announce({ text }) {
  this.broadcast("shout", { text });
  this.broadcastOthers("whisper", { text });
  return "announced";
};
