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

/**
 * Set a value at a dot-notation path whose segments came from a peer. Follows OWN
 * properties only (`constructor.prototype.x` must not reach `Object.prototype`) and throws
 * when a segment is missing or goes through a non-object.
 *
 * @param {Object|Array} obj - Object to modify (mutated)
 * @param {string} path - Dot-notation path (e.g. `user.profile.avatar`, `files.0.data`)
 * @param {any} value - Value to store at the path
 * @returns {void}
 * @throws {Error} If the path does not lead to an object that can hold the value
 */
function setAtPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || typeof current !== "object" || !hasOwn(current, parts[i])) {
      throw new Error(`Cannot set a value at "${path}": "${parts[i]}" is not a property of the message`);
    }
    current = current[parts[i]];
  }
  if (current === null || typeof current !== "object") {
    throw new Error(`Cannot set a value at "${path}": its parent is not an object`);
  }
  setKey(current, parts[parts.length - 1], value);
}

module.exports = { hasOwn, setKey, setAtPath };
