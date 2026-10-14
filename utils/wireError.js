/**
 * @fileoverview How a failed call travels from a controller to its caller.
 *
 * Domain context: a controller throws; the caller's promise must reject with an
 * Error that still says what went wrong (class, message, and the `code` / `data` the
 * controller attached), not just a message string (4.3.0).
 *
 * Technical context: the reply frame is
 * `{ err: <Error via JSS>, errCode?, errData?, type, queryId }`. JSS carries the
 * Error's `name` and `message`; its `stack` is replaced by `"Name: message"` so the
 * server's file paths and frames never reach a browser. `code` and `data` ride next
 * to it in `errCode` / `errData` because JSS does not carry extra Error properties.
 * Clients call `attachErrorDetails` to put them back on the rejected Error.
 *
 * @module utils/wireError
 * @see {@link module:server/socket/send} which sends the frame
 * @see {@link module:client/connectSocket-tryWs} which receives it in the browser
 */

const jss = require("./jss");

/**
 * Make the Error that goes on the wire for whatever a controller threw.
 *
 * @param {any} thrown - An Error, a string, an Error-shaped object (`{name, message}`) or anything else
 * @returns {any} A fresh Error (name and message kept, no stack frames); values with no
 *   message (numbers, plain objects) are returned unchanged, as 4.3.0 sent them
 */
function toWireError(thrown) {
  if (typeof thrown === "string") return new Error(thrown);
  if (thrown && typeof thrown.message === "string") {
    const wire = new Error(thrown.message);
    wire.name = String(thrown.name || "Error");
    wire.stack = `${wire.name}: ${wire.message}`;
    return wire;
  }
  return thrown;
}

/**
 * Serialise an error reply frame.
 *
 * `code` and `data` are sent when the thrown value has them. If `data` cannot be
 * serialised (a BigInt, say), the frame is sent without it rather than not at all:
 * a reply that never leaves leaves the caller waiting for its timeout.
 *
 * @param {any} thrown - What the controller threw
 * @param {string|false|null} type - Frame `type` (false for replies)
 * @param {string|false|null} queryId - The call being answered
 * @returns {string} JSS text ready for `socket.send`
 */
function errorFrame(thrown, type, queryId) {
  const frame = { err: toWireError(thrown), type, queryId };
  if (thrown && typeof thrown === "object") {
    if (thrown.code !== undefined) frame.errCode = thrown.code;
    if (thrown.data !== undefined) frame.errData = thrown.data;
  }
  try {
    return jss.stringify(frame);
  } catch (_) {
    delete frame.errData;
    return jss.stringify(frame);
  }
}

/**
 * Put the `code` and `data` a controller attached back on the Error a caller received.
 *
 * @param {any} err - The decoded `err` of a reply frame
 * @param {{errCode?: any, errData?: any}} frame - The decoded reply frame
 * @returns {any} The same `err`, with `.code` / `.data` set when the frame carried them
 */
function attachErrorDetails(err, frame) {
  if (err instanceof Error) {
    if (frame.errCode !== undefined) err.code = frame.errCode;
    if (frame.errData !== undefined) err.data = frame.errData;
  }
  return err;
}

module.exports = { toWireError, errorFrame, attachErrorDetails };
