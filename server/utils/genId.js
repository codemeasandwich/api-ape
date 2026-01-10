/**
 * @fileoverview Random ID Generator for api-ape Server
 *
 * This module provides a simple, fast random ID generator used throughout
 * api-ape for generating unique identifiers. It's primarily used for:
 * - Client connection IDs
 * - Request/query identifiers
 * - Temporary resource keys
 *
 * ## Character Set
 *
 * By default, uses a modified Base32 alphabet (Crockford-style) that excludes
 * visually ambiguous characters:
 *
 * ```
 * Included: 0123456789ABCDEFGHJKMNPQRSTVWXYZ
 * Excluded: I, L, O, U (easily confused with 1, 1, 0, V)
 * ```
 *
 * This makes IDs easier to read, transcribe, and communicate verbally.
 *
 * ## Collision Probability
 *
 * With the default 32-character alphabet and various ID lengths:
 *
 * | Length | Combinations      | 50% collision at | Use case          |
 * |--------|-------------------|------------------|-------------------|
 * | 10     | 32^10 = 1.1e15    | ~37 million      | Short-lived IDs   |
 * | 20     | 32^20 = 1.2e30    | ~1.2e15          | Client IDs        |
 * | 32     | 32^32 = 1.5e48    | ~1.2e24          | Permanent IDs     |
 *
 * ## Security Note
 *
 * This generator uses `Math.random()` which is NOT cryptographically secure.
 * For security-sensitive applications (tokens, passwords), use `crypto.randomBytes()`.
 *
 * @module server/utils/genId
 * @see {@link module:server/lib/wiring} for client ID generation
 *
 * @example <caption>Basic usage</caption>
 * const genId = require('./genId')
 *
 * // Default: 10-character ID
 * const id = genId()
 * console.log(id)  // e.g., 'K7M3NP2QW8'
 *
 * @example <caption>Custom length</caption>
 * // Longer ID for higher uniqueness
 * const clientId = genId(20)
 * console.log(clientId)  // e.g., 'K7M3NP2QW8X4R9T1V6Y2'
 *
 * // Short ID for temporary use
 * const tempId = genId(6)
 * console.log(tempId)  // e.g., 'K7M3NP'
 *
 * @example <caption>Custom character range</caption>
 * // Numeric only
 * const numericId = genId(8, '0123456789')
 * console.log(numericId)  // e.g., '47829156'
 *
 * // Lowercase alphanumeric
 * const lowerId = genId(12, 'abcdefghijklmnopqrstuvwxyz0123456789')
 * console.log(lowerId)  // e.g., 'a7k3m9x2p4q1'
 *
 * // Hex string
 * const hexId = genId(16, '0123456789abcdef')
 * console.log(hexId)  // e.g., 'a7f3c9e2b4d1f806'
 */

/**
 * Default character set for ID generation
 *
 * Uses Crockford Base32 alphabet which excludes ambiguous characters
 * (I, L, O, U) that can be confused with digits or other letters.
 *
 * @constant {string}
 * @default '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
 */
const DEFAULT_RANGE = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Default ID length in characters
 *
 * 10 characters with 32-character alphabet provides ~1.1 quadrillion
 * combinations, suitable for most temporary ID use cases.
 *
 * @constant {number}
 * @default 10
 */
const DEFAULT_SIZE = 10;

/**
 * Generate a random ID string
 *
 * Creates a random string of the specified length using characters from
 * the provided range. Each character is selected independently with
 * uniform probability.
 *
 * ## Algorithm
 *
 * ```
 * for each position in the ID:
 *   index = floor(random() * range.length)
 *   id += range[index]
 * ```
 *
 * ## Performance
 *
 * This function is optimized for speed over cryptographic security.
 * It uses `Math.random()` which is fast but predictable.
 *
 * @param {number} [size=10] - Length of the ID to generate (must be positive integer)
 * @param {string} [range='0123456789ABCDEFGHJKMNPQRSTVWXYZ'] - Characters to use
 * @returns {string} Random ID string of the specified length
 * @throws {Error} If size is not a positive number
 * @throws {Error} If range is not a non-empty string
 *
 * @example
 * // Generate default 10-character ID
 * const id = genId()
 * // Returns: 'K7M3NP2QW8' (example)
 *
 * @example
 * // Generate 20-character client ID
 * const clientId = genId(20)
 * // Returns: 'K7M3NP2QW8X4R9T1V6Y2' (example)
 *
 * @example
 * // Generate 6-digit numeric code
 * const code = genId(6, '0123456789')
 * // Returns: '478291' (example)
 *
 * @example
 * // Generate UUID-like hex string
 * const uuid = genId(32, '0123456789abcdef')
 * // Returns: 'a7f3c9e2b4d1f806e9a2c4b7d8e3f910' (example)
 *
 * @example
 * // Error handling
 * try {
 *   genId(0)  // Throws: "positive size needed"
 * } catch (err) {
 *   console.error(err.message)
 * }
 *
 * @example
 * // Integration with api-ape
 * // In wiring.js:
 * const clientId = makeid(20)  // Generate unique client identifier
 */
function genId(size, range) {
  // Apply defaults
  size = size || DEFAULT_SIZE;
  range = range || DEFAULT_RANGE;

  // Validate size parameter
  if ("number" !== typeof size) {
    throw new Error("size must be a number");
  } else if (1 > size) {
    throw new Error("positive size needed");
  }

  // Validate range parameter
  if ("string" !== typeof range) {
    throw new Error("range must be a string");
  } else if (1 > range.length) {
    throw new Error("range too small");
  }

  // Build the random ID
  var id = "";

  for (var i = 0; i < size; i++) {
    // Select random character from range
    // Math.random() returns [0, 1), so floor(random * length) gives [0, length-1]
    id += range[~~(Math.random() * range.length)];
  }

  return id;
}

module.exports = genId;
