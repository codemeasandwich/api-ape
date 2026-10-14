/**
 * @fileoverview How a reply travels from a controller to its caller, on every transport.
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
 * What is forwarded (4.4.0): a thrown value is untrusted output of whatever the
 * controller called, including libraries. `code` goes only when it is an OWN
 * ENUMERABLE data property holding a string or a number; `data` only when it is
 * own, enumerable and plain data (primitives, arrays, plain objects, Dates, nesting
 * under 32, no cycles, no functions / class instances / BigInts). Nothing at all is
 * forwarded from a Node system error (it has `syscall` or `errno`: ECONNREFUSED,
 * ENOENT ... carry paths and addresses). The rule: attach `code` and `data` to
 * errors YOU throw; wrap a library's error before it leaves the controller.
 *
 * @module utils/wireError
 * @see {@link module:server/socket/send} which sends the frame
 * @see {@link module:client/connectSocket-tryWs} which receives it in the browser
 */

const jss = require("./jss");
const { hasOwn } = require("./safeKeys");

/** Deepest nesting `errData` may have and still be forwarded. */
const MAX_DATA_DEPTH = 32;

/**
 * Make the Error that goes on the wire for whatever a controller threw.
 *
 * @param {any} thrown - An Error, a string, an Error-shaped object (`{name, message}`) or anything else
 * @returns {any} A fresh Error (name and message kept, no stack frames); values with no
 *   message (numbers, plain objects) are returned as 4.3.0 sent them, except that an
 *   own `stack` is never forwarded
 */
function toWireError(thrown) {
  if (typeof thrown === "string") return new Error(thrown);
  if (thrown && typeof thrown.message === "string") {
    const wire = new Error(thrown.message);
    wire.name = String(thrown.name || "Error");
    wire.stack = `${wire.name}: ${wire.message}`;
    return wire;
  }
  if (thrown && typeof thrown === "object" && hasOwn(thrown, "stack")) {
    const { stack, ...rest } = thrown;
    return rest;
  }
  return thrown;
}

/**
 * Is this value plain data that is safe to hand to a caller?
 *
 * @param {any} value - Candidate `data`
 * @param {any[]} [ancestors=[]] - Objects being walked (cycle guard)
 * @returns {boolean} True for primitives (not BigInt/symbol/function), Dates, and arrays /
 *   plain objects of such values nested under `MAX_DATA_DEPTH` without cycles
 */
function isPlainData(value, ancestors = []) {
  if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) return true;
  if (typeof value !== "object") return false;
  const kind = Object.prototype.toString.call(value);
  if (kind === "[object Date]") return true;
  const proto = Object.getPrototypeOf(value);
  const plain = kind === "[object Object]" && (proto === null || Object.getPrototypeOf(proto) === null);
  if (!(plain || Array.isArray(value))) return false;
  if (ancestors.length >= MAX_DATA_DEPTH || ancestors.includes(value)) return false;
  ancestors.push(value);
  const ok = Object.values(value).every((inner) => isPlainData(inner, ancestors));
  ancestors.pop();
  return ok;
}

/**
 * The value of an own, enumerable data property (never a getter, never inherited).
 *
 * @param {Object} obj - Thrown object
 * @param {string} key - Property name
 * @returns {any} The value, or `undefined`
 */
function ownValue(obj, key) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  return descriptor && descriptor.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * The `errCode` / `errData` a thrown value may send (see the module comment for the rule).
 *
 * @param {any} thrown - What the controller threw
 * @returns {{errCode?: string|number, errData?: any}} Fields to put on the reply frame
 */
function errorDetails(thrown) {
  const details = {};
  if (!thrown || typeof thrown !== "object" || hasOwn(thrown, "syscall") || hasOwn(thrown, "errno")) {
    return details;
  }
  const code = ownValue(thrown, "code");
  if (typeof code === "string" || typeof code === "number") details.errCode = code;
  const data = ownValue(thrown, "data");
  if (data !== undefined && isPlainData(data)) details.errData = data;
  return details;
}

/**
 * Serialise an error reply frame.
 *
 * `code` and `data` are sent when the rule in the module comment allows it. The reply
 * always leaves: if the thrown value itself cannot be serialised (a plain object
 * holding a BigInt, say), the caller gets an `Error` saying so rather than waiting
 * for its timeout.
 *
 * @param {any} thrown - What the controller threw
 * @param {string|false|null} type - Frame `type` (false for replies)
 * @param {string|false|null} queryId - The call being answered
 * @returns {string} JSS text ready for `socket.send`
 */
function errorFrame(thrown, type, queryId) {
  const frame = { err: toWireError(thrown), type, queryId, ...errorDetails(thrown) };
  try {
    return jss.stringify(frame);
  } catch (_) {
    frame.err = new Error("The controller threw a value that cannot be sent");
    return jss.stringify(frame);
  }
}

/**
 * Serialise a successful reply, or a push, as the same frame on every transport.
 *
 * JSON drops an `undefined` property, which would leave a reply with no `data` key at
 * all; the `<!U>` tag makes the caller's `data` come back as `undefined`.
 *
 * @param {any} data - What the controller returned (or the pushed payload)
 * @param {string|false|null} type - Frame `type` (false for replies)
 * @param {string|false|null} queryId - The call being answered
 * @returns {string} JSS text ready for `socket.send` or an SSE `data:` line
 */
function dataFrame(data, type, queryId) {
  return jss.stringify(data === undefined ? { "data<!U>": 0, type, queryId } : { data, type, queryId });
}

/**
 * The frame `this.keepalive()` sends: the call is still running; not a reply.
 *
 * @param {string} queryId - The running call
 * @returns {string} JSS text ready for `socket.send` or an SSE `data:` line
 */
function keepaliveFrame(queryId) {
  return jss.stringify({ queryId, _keepalive: true });
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

module.exports = { toWireError, errorFrame, dataFrame, keepaliveFrame, attachErrorDetails };
