/**
 * @fileoverview JSS Encoder - Encodes JavaScript objects to JSS format
 *
 * This module provides the encoding functionality for JSON Super Set (JSS).
 * It converts JavaScript objects containing extended types (Date, RegExp,
 * Error, Map, Set, undefined) into a JSON-compatible format using tagged keys.
 *
 * ## Encoding Process
 *
 * The encoder traverses the object tree and:
 * 1. Detects extended types using `Object.prototype.toString`
 * 2. Converts them to primitive representations
 * 3. Tags the key with a type indicator (e.g., `<!D>` for Date)
 * 4. Tracks visited objects to handle circular references
 *
 * ## Tag System
 *
 * | Type      | Tag | Encoded Value                          |
 * |-----------|-----|----------------------------------------|
 * | Date      | `D` | Unix timestamp (milliseconds)          |
 * | RegExp    | `R` | String representation (e.g., "/a/gi")  |
 * | Error     | `E` | Array: [name, message, stack]          |
 * | undefined | `U` | null                                   |
 * | Map       | `M` | Object from entries                    |
 * | Set       | `S` | Array of values                        |
 * | Pointer   | `P` | Path array to referenced object        |
 *
 * ## Array Type Tags
 *
 * For arrays containing extended types, the tag includes all element types:
 * ```javascript
 * [new Date(), new Date()]  →  { "[D,D]": [timestamp1, timestamp2] }
 * ```
 *
 * @module utils/jss/encode
 * @see {@link module:utils/jss/decode} for decoding implementation
 * @see {@link module:utils/jss} for main JSS module
 *
 * @example
 * const { encode, stringify } = require('./encode')
 *
 * // Encode without stringifying (returns plain object)
 * const encoded = encode({
 *   created: new Date('2024-01-01'),
 *   pattern: /test/i
 * })
 * // { "created<!D>": 1704067200000, "pattern<!R>": "/test/i" }
 *
 * // Stringify (encode + JSON.stringify)
 * const str = stringify({ date: new Date() })
 * // Ready for transmission
 *
 * @example
 * // Circular reference handling
 * const obj = { name: 'root' }
 * obj.self = obj
 *
 * const encoded = encode(obj)
 * // { name: 'root', 'self<!P>': [] }
 * // The empty array [] is the path to the root object
 */

/**
 * Lookup table mapping Object.prototype.toString results to type tags
 *
 * Used for fast type detection during encoding. Only types that require
 * special handling are included - standard JSON types (string, number,
 * boolean, null, array, object) are handled separately.
 *
 * @constant {Object.<string, string>}
 * @private
 *
 * @example
 * Object.prototype.toString.call(new Date())  // '[object Date]'
 * tagLookup['[object Date]']                  // 'D'
 */
const { getAllPlugins } = require("./plugins");

const tagLookup = {
  /**
   * RegExp objects - serialized as string pattern
   */
  "[object RegExp]": "R",

  /**
   * Date objects - serialized as Unix timestamp
   */
  "[object Date]": "D",

  /**
   * Error objects - serialized as [name, message, stack] array
   */
  "[object Error]": "E",

  /**
   * Undefined values - explicitly encoded (unlike JSON which omits them)
   */
  "[object Undefined]": "U",

  /**
   * Map objects - serialized as plain object from entries
   */
  "[object Map]": "M",

  /**
   * Set objects - serialized as array of values
   */
  "[object Set]": "S",
};

/**
 * Encode a JavaScript object to JSS format
 *
 * Recursively traverses the object tree, converting extended types to
 * their tagged representations. Handles circular references by tracking
 * visited objects and replacing subsequent references with path pointers.
 *
 * ## Algorithm
 *
 * 1. Create a WeakMap to track visited objects and their paths
 * 2. For each value in the object:
 *    - If it's an extended type (Date, RegExp, etc.), encode it
 *    - If it's an object/array, recurse (checking for circularity)
 *    - If it's a primitive, pass through unchanged
 * 3. Return the encoded object structure
 *
 * ## Circular Reference Detection
 *
 * When an object is first encountered, its path is stored in `visitedEncode`.
 * If the same object is encountered again, a pointer (`P` tag) is created
 * with the stored path.
 *
 * @param {any} obj - The object to encode
 * @returns {Object} Encoded object with tagged keys for extended types
 *
 * @example
 * // Simple types
 * encode({ date: new Date('2024-01-01') })
 * // { "date<!D>": 1704067200000 }
 *
 * @example
 * // Nested structures
 * encode({
 *   user: {
 *     name: 'Alice',
 *     createdAt: new Date(),
 *     roles: new Set(['admin', 'user'])
 *   }
 * })
 * // {
 * //   user: {
 * //     name: 'Alice',
 * //     "createdAt<!D>": 1704067200000,
 * //     "roles<!S>": ['admin', 'user']
 * //   }
 * // }
 *
 * @example
 * // Circular references
 * const a = { name: 'a' }
 * const b = { name: 'b', ref: a }
 * a.ref = b
 *
 * encode({ a, b })
 * // {
 * //   a: { name: 'a', 'ref<!P>': ['b'] },
 * //   b: { name: 'b', 'ref<!P>': ['a'] }
 * // }
 *
 * @example
 * // Error objects
 * encode({ error: new TypeError('Invalid input') })
 * // { "error<!E>": ['TypeError', 'Invalid input', 'TypeError: Invalid input\n    at ...'] }
 *
 * @example
 * // Mixed array with extended types
 * encode({ dates: [new Date(), new Date()] })
 * // { "dates<![D,D]>": [1704067200000, 1704067300000] }
 */
function encode(obj) {
  /**
   * WeakMap tracking visited objects to detect circular references
   * Maps each visited object to its path in the object tree
   * @type {WeakMap<Object, Array<string|number>>}
   */
  const visitedEncode = new WeakMap();
  visitedEncode.set(obj, []);

  /**
   * Recursively encode a value with circular reference tracking
   *
   * @param {any} value - The value to encode
   * @param {Array<string|number>} path - Current path in the object tree
   * @returns {[string, any]} Tuple of [tag, encodedValue]
   * @private
   */
  function encodeValueWithVisited(value, path = []) {
    const type = typeof value;
    const tag = tagLookup[Object.prototype.toString.call(value)];

    // Handle special types with known tags
    if (tag !== undefined) {
      if ("D" === tag) return [tag, value.valueOf()];
      if ("E" === tag) return [tag, [value.name, value.message, value.stack]];
      if ("R" === tag) return [tag, value.toString()];
      if ("U" === tag) return [tag, null];
      if ("S" === tag) return [tag, Array.from(value)];
      if ("M" === tag) return [tag, Object.fromEntries(value)];
    }

    // Check custom plugins
    for (const [customTag, plugin] of getAllPlugins()) {
      const key = path.length > 0 ? path[path.length - 1] : undefined;
      if (plugin.check(key, value)) {
        return [customTag, plugin.encode(path, key, value, {})];
      }
    }

    // Handle objects and arrays (potential circular references)
    if (type === "object" && value !== null) {
      // Check for circular reference
      if (visitedEncode.has(value)) return ["P", visitedEncode.get(value)];

      // Mark as visited with current path
      visitedEncode.set(value, path);

      const isArray = Array.isArray(value);
      const objKeys = isArray
        ? Array.from(Array(value.length).keys())
        : Object.keys(value);
      const result = isArray ? [] : {};
      const typesFound = [];

      // Process each property/element
      for (let i = 0; i < objKeys.length; i++) {
        const key = objKeys[i];
        const [t, v] = encodeValueWithVisited(value[key], [...path, key]);

        if (isArray) {
          typesFound.push(t);
          result.push(v);
        } else if (value[key] !== undefined) {
          // Add tag to key if value was special type
          result[key + (t ? `<!${t}>` : "")] = v;
        }
      }

      // For arrays with special types, create compound tag
      if (isArray && typesFound.find((t) => !!t))
        return [`[${typesFound.join()}]`, result];
      return ["", result];
    }
    // Primitive values pass through unchanged
    else {
      return ["", value];
    }
  }

  // Process root object properties
  let keys = Array.isArray(obj)
    ? Array.from(Array(obj.length).keys())
    : Object.keys(obj);
  const result = {};

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (obj[key] !== undefined) {
      const [t, v] = encodeValueWithVisited(obj[key], [key]);
      result[key + (t ? `<!${t}>` : "")] = v;
    }
  }

  return result;
}

/**
 * Stringify an object to JSS format
 *
 * Combines `encode()` with `JSON.stringify()` to produce a string
 * representation suitable for transmission over WebSocket or storage.
 *
 * This is the high-level API - use this for most cases.
 *
 * @param {any} obj - The object to stringify
 * @returns {string} JSS-encoded JSON string
 *
 * @example
 * // Basic usage
 * const str = stringify({
 *   message: 'Hello',
 *   timestamp: new Date(),
 *   pattern: /world/i
 * })
 * // '{"message":"Hello","timestamp<!D>":1704067200000,"pattern<!R>":"/world/i"}'
 *
 * @example
 * // With nested objects
 * const str = stringify({
 *   user: {
 *     settings: new Map([['theme', 'dark']])
 *   }
 * })
 *
 * @example
 * // Ready for WebSocket transmission
 * socket.send(stringify({ type: '/chat', data: { text: 'Hi!' } }))
 */
function stringify(obj) {
  return JSON.stringify(encode(obj));
}

module.exports = { encode, stringify };
