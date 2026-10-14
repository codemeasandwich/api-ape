/**
 * @fileoverview Property access for names that come from a peer.
 *
 * Domain context: a peer chooses frame types, object keys and path segments. A plain
 * `obj[name]` on such a name reaches inherited members (`constructor`, `valueOf`,
 * `__proto__`) and a plain `obj[name] = v` with `__proto__` replaces a prototype.
 * Every place that indexes an object with peer text goes through these two helpers.
 *
 * Technical context: pure functions, no Node APIs, so the browser client and the
 * server share them (`utils/jss/decode.js`, `server/socket/tagUtils.js`,
 * `server/socket/receive.js`, `server/lib/longPolling/postHandler.js`).
 *
 * @module utils/safeKeys
 * @see {@link module:utils/jss/decode} for the decoder that depends on it
 */

/**
 * Own-property test that cannot be fooled by a key such as `hasOwnProperty`.
 *
 * @param {Object} obj - Object to look in
 * @param {any} key - Property name (peer-supplied)
 * @returns {boolean} True when `key` is an own property of `obj`
 */
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Set a peer-chosen key on an object. `__proto__` becomes an ordinary own key (as
 * `JSON.parse` makes it) instead of replacing the object's prototype.
 *
 * @param {Object|Array} target - Object being filled
 * @param {string|number} key - Key from the peer
 * @param {any} value - Value to store
 * @returns {void}
 */
function setKey(target, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

module.exports = { hasOwn, setKey };
