/**
 * @fileoverview JSS Decoder - Decodes JSS Format Back to JavaScript Objects
 *
 * This module provides the decoding/parsing functionality for JSS (JSON Super Set).
 * It reverses the encoding process, restoring JavaScript types from their tagged
 * string representations.
 *
 * ## Decoding Process
 *
 * 1. Parse the JSON string (if using `parse()`)
 * 2. Recursively traverse the object structure
 * 3. Detect tagged keys (e.g., `key<!D>` for Date)
 * 4. Apply the appropriate decoder for each tag
 * 5. Resolve circular reference pointers
 * 6. Return the fully restored object
 *
 * ## Supported Tags
 *
 * | Tag | Type      | Decoder Behavior                          |
 * |-----|-----------|-------------------------------------------|
 * | `D` | Date      | `new Date(timestamp)`                     |
 * | `R` | RegExp    | `new RegExp(pattern)` from string         |
 * | `E` | Error     | Reconstructs with name, message, stack    |
 * | `U` | undefined | Returns `undefined` value                 |
 * | `M` | Map       | `new Map(Object.entries(obj))`            |
 * | `S` | Set       | `new Set(array)`                          |
 * | `P` | Pointer   | Circular reference (resolved after parse) |
 *
 * ## Circular Reference Resolution
 *
 * Circular references are encoded as path pointers. During decoding:
 * 1. First pass: Decode all values, storing pointer locations
 * 2. Second pass: Resolve pointers by following stored paths
 *
 * ```javascript
 * // Encoded: { "self<!P>": [] }  // Pointer to root
 * // Decoded: obj.self === obj     // Circular reference restored
 * ```
 *
 * @module utils/jss/decode
 * @see {@link module:utils/jss/encode} for the encoding counterpart
 * @see {@link module:utils/jss} for the main JSS module
 *
 * @example
 * // Basic decoding
 * const { parse } = require('./decode')
 *
 * const result = parse('{"timestamp<!D>":1704067200000}')
 * console.log(result.timestamp instanceof Date)  // true
 * console.log(result.timestamp.toISOString())    // '2024-01-01T00:00:00.000Z'
 *
 * @example
 * // Decoding errors with preserved stack traces
 * const { parse } = require('./decode')
 *
 * const result = parse('{"err<!E>":["TypeError","Invalid input","Error: Invalid input\\n    at ..."]}')
 * console.log(result.err instanceof TypeError)   // true
 * console.log(result.err.message)                // 'Invalid input'
 * console.log(result.err.stack)                  // Original stack trace
 *
 * @example
 * // Low-level decode without JSON parsing
 * const { decode } = require('./decode')
 *
 * const encoded = { "items<!S>": [1, 2, 3], "config<!M>": { a: 1, b: 2 } }
 * const decoded = decode(encoded)
 * console.log(decoded.items instanceof Set)  // true
 * console.log(decoded.config instanceof Map) // true
 */

/**
 * Temporary storage for circular reference pointers during decoding
 *
 * Each entry is a tuple of [sourcePath, targetPath] where:
 * - sourcePath: Path to the referenced object
 * - targetPath: Path where the reference should be placed
 *
 * This is reset at the start of each decode() call.
 *
 * @type {Array<[string[], string[]]>}
 * @private
 */
const { getPlugin } = require("./plugins");

let pointers2Res = [];

/**
 * Tag decoder lookup table
 *
 * Maps single-character tags to their decoder functions.
 * Each decoder takes the encoded value and returns the decoded JavaScript value.
 *
 * @type {Object.<string, function(any, string[]?): any>}
 * @private
 *
 * @property {function(string): RegExp} R - Decode RegExp from string pattern
 * @property {function(number): Date} D - Decode Date from timestamp
 * @property {function(string[], string[]): null} P - Register pointer for later resolution
 * @property {function([string, string, string]): Error} E - Decode Error with name, message, stack
 * @property {function(): undefined} U - Return undefined
 * @property {function(any[]): Set} S - Decode Set from array
 * @property {function(Object): Map} M - Decode Map from object entries
 */
const tagLookup = {
  /**
   * Decode RegExp from string pattern
   * @param {string} s - RegExp string (e.g., '/pattern/flags')
   * @returns {RegExp} Reconstructed RegExp instance
   */
  R: (s) => {
    // Parse /pattern/flags format
    const match = s.match(/^\/(.*)\/([gimsuy]*)$/);
    if (match) {
      return new RegExp(match[1], match[2]);
    }
    // Fallback: treat as raw pattern with no flags
    return new RegExp(s);
  },

  /**
   * Decode Date from timestamp
   * @param {number} n - Unix timestamp in milliseconds
   * @returns {Date} Reconstructed Date instance
   */
  D: (n) => new Date(n),

  /**
   * Register circular reference pointer for later resolution
   * @param {string[]} sourcePath - Path to the referenced object
   * @param {string[]} currentPath - Path where reference should be placed
   * @returns {null} Placeholder (will be replaced during resolution)
   */
  P: (sourcePath, currentPath) => {
    pointers2Res.push([sourcePath, currentPath]);
    return null;
  },

  /**
   * Decode Error with preserved type, message, and stack
   *
   * Attempts to reconstruct the original error type (TypeError, RangeError, etc.)
   * Falls back to generic Error if the type is not available globally.
   *
   * @param {[string, string, string]} errorData - Tuple of [name, message, stack]
   * @returns {Error} Reconstructed Error instance
   */
  E: ([name, message, stack]) => {
    let err;
    try {
      // Try to create the specific error type (TypeError, RangeError, etc.)
      err = new global[name](message);
      if (err instanceof Error) {
        err.stack = stack;
      } else {
        throw {}; // Force fallback if not a real Error
      }
    } catch (e) {
      // Fallback to generic Error with custom name
      err = new Error(message);
      err.name = name;
      err.stack = stack;
    }
    return err;
  },

  /**
   * Decode undefined value
   * @returns {undefined}
   */
  U: () => undefined,

  /**
   * Decode Set from array
   * @param {any[]} a - Array of set elements
   * @returns {Set} Reconstructed Set instance
   */
  S: (a) => new Set(a),

  /**
   * Decode Map from object entries
   * @param {Object} o - Object with key-value pairs
   * @returns {Map} Reconstructed Map instance
   */
  M: (o) => new Map(Object.entries(o)),

  /**
   * Decode inline base64 binary data
   * @param {string} s - Base64 encoded string
   * @returns {Buffer|ArrayBuffer} Decoded binary data (Buffer in Node, ArrayBuffer in browser)
   */
  I: (s) => {
    // In Node.js, return Buffer
    if (typeof Buffer !== "undefined") {
      return Buffer.from(s, "base64");
    }
    // In browser, return ArrayBuffer
    const binaryStr = atob(s);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
  },
};

/**
 * Parse a tagged key to extract the property name and tag
 *
 * JSS encodes type information in property keys using the format `name<!tag>`.
 * This function separates the original property name from its type tag.
 *
 * Also handles array type tags which have the format `[tag1,tag2,...]`.
 *
 * @param {string} key - Property key potentially containing a tag
 * @returns {[string, string|undefined]} Tuple of [propertyName, tag]
 *                                       Tag is undefined if key has no tag
 * @private
 *
 * @example
 * parseKeyWithTags('createdAt<!D>')  // ['createdAt', 'D']
 * parseKeyWithTags('pattern<!R>')    // ['pattern', 'R']
 * parseKeyWithTags('name')           // ['name', undefined]
 * parseKeyWithTags('items<![D,D,D]') // ['items', '[D,D,D]']
 */
function parseKeyWithTags(key) {
  const match = key.match(/(.+)<!(.*)>/);

  if (match) {
    const name = match[1];
    let tag = match[2];

    // Handle array type tags that may be split across chunks
    // e.g., '[D,D,D' needs the closing ']'
    if (tag.startsWith("[") && !tag.endsWith("]")) {
      tag += "]";
    }

    return [name, tag];
  }

  return [key, undefined];
}

// Guard against stack overflow on pathologically nested structures.
// Normal RPC payloads are < 20 levels deep; 500 is very generous.
const MAX_DECODE_DEPTH = 500;

/**
 * Recursively decode a value based on its tag
 *
 * This is the core decoding function that handles all JSS types.
 * It processes:
 * - Tagged values using the tagLookup decoders
 * - Arrays (including typed arrays with per-element tags)
 * - Objects (recursively decoding nested properties)
 * - Primitive values (passed through unchanged)
 *
 * @param {any} val - The value to decode
 * @param {string|undefined} tag - Type tag (D, R, E, U, M, S, P, or array format)
 * @param {string[]} [path=[]] - Current path for circular reference tracking
 * @param {number} [depth=0] - Internal recursion guard (paired with MAX_DECODE_DEPTH)
 * @returns {any} The decoded value with original JavaScript type
 * @private
 *
 * @example
 * // Decode a Date
 * decodeValue(1704067200000, 'D')
 * // Returns: Date instance
 *
 * @example
 * // Decode a nested object
 * decodeValue({ "name<!>": "test", "date<!D>": 1704067200000 }, undefined)
 * // Returns: { name: 'test', date: Date }
 *
 * @example
 * // Decode a typed array
 * decodeValue([1704067200000, 1704153600000], '[D,D]')
 * // Returns: [Date, Date]
 */

function decodeValue(val, tag, path = [], depth = 0) {
  if (depth > MAX_DECODE_DEPTH) {
    throw new Error(
      `JSS decode depth limit exceeded at depth ${depth}, path: ...${path.slice(-3).join('.')}. ` +
      `Fix: Reduce object nesting depth below ${MAX_DECODE_DEPTH}. The structure may contain unintended recursion.`
    );
  }

  // If we have a known tag, use the appropriate decoder
  if (tag in tagLookup) {
    return tagLookup[tag](val, path);
  }

  // Check custom plugins
  const plugin = getPlugin(tag);
  if (plugin) {
    return plugin.decode(val, path, {});
  }

  // Handle arrays
  if (Array.isArray(val)) {
    const res = [];

    // Check if this is a typed array (tag format: '[D,D,D]')
    const isTaggedArray = tag && tag.startsWith("[");
    const typeTags = isTaggedArray ? tag.slice(1, -1).split(",") : [];

    for (let i = 0; i < val.length; i++) {
      res.push(decodeValue(val[i], typeTags[i], [...path, i], depth + 1));
    }

    return res;
  }

  // Handle objects
  if (val !== null && typeof val === "object") {
    const res = {};

    for (const key in val) {
      const [name, t] = parseKeyWithTags(key);
      res[name] = decodeValue(val[key], t, [...path, name], depth + 1);
    }

    return res;
  }

  // Primitive values - return as-is
  return val;
}

/**
 * Resolve a circular reference pointer
 *
 * After initial decoding, circular references are represented as null values
 * with their paths stored in pointers2Res. This function resolves each pointer
 * by navigating to the referenced object and placing it at the target location.
 *
 * @param {Object} obj - The root decoded object
 * @param {[string[], string[]]} pointerInfo - Tuple of [refPath, attrPath]
 *        - refPath: Path to the object being referenced
 *        - attrPath: Path where the reference should be placed
 * @returns {void} Modifies obj in place
 * @private
 *
 * @example
 * // Given: obj = { child: { name: 'test' }, ref: null }
 * // With pointer: [['child'], ['ref']]
 * // After resolution: obj.ref === obj.child
 *
 * resolvePointers(obj, [['child'], ['ref']])
 * console.log(obj.ref === obj.child)  // true
 */
function resolvePointers(obj, [refPath, attrPath]) {
  // Navigate to the referenced object
  let ref = obj;
  for (const key of refPath) {
    ref = ref[key];
  }

  // Navigate to the parent of the target location
  let attrParent = obj;
  for (let i = 0; i < attrPath.length - 1; i++) {
    attrParent = attrParent[attrPath[i]];
  }

  // Set the reference at the target location
  attrParent[attrPath[attrPath.length - 1]] = ref;
}

/**
 * Decode a JSS-encoded object back to its original form
 *
 * This is the low-level decode function that operates on already-parsed
 * JavaScript objects. Use `parse()` if you have a JSON string.
 *
 * ## Processing Steps
 *
 * 1. Reset pointer storage for circular references
 * 2. Recursively decode all values using decodeValue()
 * 3. Resolve all circular reference pointers
 * 4. Return the fully restored object
 *
 * @param {Object} data - JSS-encoded plain object (already parsed from JSON)
 * @returns {any} Decoded object with original JavaScript types restored
 *
 * @example
 * // Decode a Date
 * const decoded = decode({ "created<!D>": 1704067200000 })
 * console.log(decoded.created instanceof Date)  // true
 *
 * @example
 * // Decode multiple types
 * const decoded = decode({
 *   "date<!D>": 1704067200000,
 *   "regex<!R>": "/test/gi",
 *   "items<!S>": [1, 2, 3],
 *   "config<!M>": { key: "value" }
 * })
 *
 * console.log(decoded.date instanceof Date)     // true
 * console.log(decoded.regex instanceof RegExp)  // true
 * console.log(decoded.items instanceof Set)     // true
 * console.log(decoded.config instanceof Map)    // true
 *
 * @example
 * // Decode with circular reference
 * const decoded = decode({
 *   name: "root",
 *   "self<!P>": []  // Pointer to root
 * })
 *
 * console.log(decoded.self === decoded)  // true
 */
function decode(data) {
  // Reset pointer storage for this decode operation
  pointers2Res = [];

  // Decode all values recursively
  const result = decodeValue(data, undefined, []);

  // Resolve all circular reference pointers
  pointers2Res.forEach((p) => resolvePointers(result, p));

  return result;
}

/**
 * Parse a JSS-encoded JSON string back to its original form
 *
 * This is the high-level parse function that combines JSON.parse with
 * JSS decoding. It's the counterpart to `stringify()` from the encode module.
 *
 * ## Usage
 *
 * ```javascript
 * const { parse } = require('./decode')
 * const original = parse(jssString)
 * ```
 *
 * ## Error Handling
 *
 * - Throws `SyntaxError` if the string is not valid JSON
 * - Invalid tags are silently ignored (value passed through as-is)
 * - Missing referenced objects in pointers will cause runtime errors
 *
 * @param {string} encoded - JSS-encoded JSON string
 * @returns {any} Decoded object with original JavaScript types restored
 * @throws {SyntaxError} If the input is not valid JSON
 *
 * @example
 * // Parse a complete JSS message
 * const result = parse(`{
 *   "type": "message",
 *   "timestamp<!D>": 1704067200000,
 *   "pattern<!R>": "/hello/i",
 *   "data": {
 *     "items<!S>": [1, 2, 3]
 *   }
 * }`)
 *
 * console.log(result.type)                      // 'message'
 * console.log(result.timestamp instanceof Date) // true
 * console.log(result.pattern instanceof RegExp) // true
 * console.log(result.data.items instanceof Set) // true
 *
 * @example
 * // Round-trip with encode
 * const { stringify } = require('./encode')
 * const { parse } = require('./decode')
 *
 * const original = {
 *   date: new Date(),
 *   items: new Set([1, 2, 3])
 * }
 *
 * const restored = parse(stringify(original))
 * console.log(restored.date.getTime() === original.date.getTime())  // true
 * console.log([...restored.items])  // [1, 2, 3]
 */
function parse(encoded) {
  return decode(JSON.parse(encoded));
}

module.exports = { decode, parse };
