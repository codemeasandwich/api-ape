/**
 * @fileoverview JSON Super Set (JSS) - Extended JSON Serialization
 *
 * JSS extends standard JSON to support additional JavaScript types that
 * JSON.stringify/parse cannot handle. This enables api-ape to transparently
 * serialize and deserialize rich data types over WebSocket connections.
 *
 * ## Supported Types
 *
 * | Type           | Tag | Description                           |
 * |----------------|-----|---------------------------------------|
 * | Date           | `D` | Serialized as timestamp               |
 * | RegExp         | `R` | Serialized as string pattern          |
 * | Error          | `E` | Preserves name, message, and stack    |
 * | undefined      | `U` | Explicitly represents undefined       |
 * | Map            | `M` | Converted to/from object entries      |
 * | Set            | `S` | Converted to/from array               |
 * | Circular Refs  | `P` | Preserved via path pointers           |
 *
 * ## Wire Format
 *
 * JSS encodes type information into object keys using a tag suffix:
 *
 * ```javascript
 * // Original object
 * { createdAt: new Date('2024-01-01'), pattern: /hello/i }
 *
 * // JSS encoded
 * { "createdAt<!D>": 1704067200000, "pattern<!R>": "/hello/i" }
 * ```
 *
 * ## Usage
 *
 * JSS provides a drop-in replacement for JSON.stringify/parse:
 *
 * ```javascript
 * const jss = require('./jss')
 *
 * // Stringify (like JSON.stringify but handles extended types)
 * const str = jss.stringify({ date: new Date(), regex: /test/ })
 *
 * // Parse (like JSON.parse but restores extended types)
 * const obj = jss.parse(str)
 * // obj.date is a Date instance
 * // obj.regex is a RegExp instance
 * ```
 *
 * ## API Methods
 *
 * - `stringify(obj)` - Convert object to JSS string (high-level)
 * - `parse(str)` - Parse JSS string back to object (high-level)
 * - `encode(obj)` - Convert object to JSS-encoded plain object
 * - `decode(obj)` - Convert JSS-encoded object back to original
 *
 * ## Circular Reference Handling
 *
 * JSS can handle circular references using path pointers:
 *
 * ```javascript
 * const obj = { name: 'root' }
 * obj.self = obj  // Circular reference
 *
 * const str = jss.stringify(obj)  // No error!
 * const restored = jss.parse(str)
 * console.log(restored.self === restored)  // true
 * ```
 *
 * @module utils/jss
 * @see {@link module:utils/jss/encode} for encoding implementation
 * @see {@link module:utils/jss/decode} for decoding implementation
 *
 * @example
 * // Basic usage with dates
 * const jss = require('./jss')
 *
 * const data = {
 *   user: 'Alice',
 *   loginAt: new Date(),
 *   settings: new Map([['theme', 'dark'], ['lang', 'en']])
 * }
 *
 * const serialized = jss.stringify(data)
 * // Can be sent over WebSocket
 *
 * const restored = jss.parse(serialized)
 * console.log(restored.loginAt instanceof Date)  // true
 * console.log(restored.settings instanceof Map)  // true
 *
 * @example
 * // Error serialization
 * const jss = require('./jss')
 *
 * try {
 *   throw new TypeError('Invalid input')
 * } catch (err) {
 *   const serialized = jss.stringify({ error: err })
 *   const restored = jss.parse(serialized)
 *
 *   console.log(restored.error instanceof TypeError)  // true
 *   console.log(restored.error.message)  // 'Invalid input'
 *   console.log(restored.error.stack)    // Original stack trace
 * }
 *
 * @example
 * // Low-level encode/decode for inspection
 * const jss = require('./jss')
 *
 * const encoded = jss.encode({
 *   date: new Date('2024-01-01'),
 *   items: new Set([1, 2, 3])
 * })
 *
 * console.log(encoded)
 * // {
 * //   "date<!D>": 1704067200000,
 * //   "items<!S>": [1, 2, 3]
 * // }
 *
 * const decoded = jss.decode(encoded)
 * // Original types restored
 */

const { encode, stringify } = require("./jss/encode");
const { decode, parse } = require("./jss/decode");

/**
 * Parse a JSS-encoded string back into an object with restored types
 *
 * This is the primary method for deserializing JSS data. It combines
 * JSON.parse with type restoration for Date, RegExp, Error, Map, Set,
 * undefined, and circular references.
 *
 * @function parse
 * @param {string} encoded - JSS-encoded JSON string
 * @returns {any} Decoded object with original types restored
 * @throws {SyntaxError} If the string is not valid JSON
 *
 * @example
 * const obj = jss.parse('{"date<!D>":1704067200000}')
 * console.log(obj.date instanceof Date)  // true
 */

/**
 * Convert an object to a JSS-encoded JSON string
 *
 * This is the primary method for serializing objects with extended types.
 * It handles Date, RegExp, Error, Map, Set, undefined, and circular
 * references that would cause JSON.stringify to fail or lose information.
 *
 * @function stringify
 * @param {any} obj - Object to serialize
 * @returns {string} JSS-encoded JSON string
 *
 * @example
 * const str = jss.stringify({
 *   when: new Date(),
 *   pattern: /\d+/g,
 *   items: new Set([1, 2, 3])
 * })
 */

/**
 * Encode an object to JSS format (without stringifying)
 *
 * Low-level method that converts extended types to their tagged
 * representations. Useful for inspection or custom serialization.
 *
 * @function encode
 * @param {any} obj - Object to encode
 * @returns {Object} Plain object with tagged keys for extended types
 *
 * @example
 * const encoded = jss.encode({ date: new Date() })
 * // { "date<!D>": 1704067200000 }
 */

/**
 * Decode a JSS-encoded object (without parsing from string)
 *
 * Low-level method that restores extended types from their tagged
 * representations. Useful when working with already-parsed data.
 *
 * @function decode
 * @param {Object} data - JSS-encoded plain object
 * @returns {any} Object with original types restored
 *
 * @example
 * const decoded = jss.decode({ "date<!D>": 1704067200000 })
 * console.log(decoded.date instanceof Date)  // true
 */

module.exports = { parse, stringify, encode, decode };
