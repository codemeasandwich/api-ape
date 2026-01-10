/**
 * @fileoverview Message Hashing Utilities for api-ape
 *
 * This module provides deterministic hash generation for api-ape messages.
 * Hashes are used to correlate WebSocket requests with their responses,
 * enabling the request/response pattern over a bidirectional channel.
 *
 * ## Hash Algorithm
 *
 * Uses the Jenkins one-at-a-time hash algorithm, which provides:
 * - Good distribution (avalanche effect)
 * - Fast computation
 * - Low collision rate for typical message sizes
 * - Deterministic output (same input always produces same hash)
 *
 * ## Encoding
 *
 * Hash values are encoded using Crockford Base32, which:
 * - Excludes ambiguous characters (O, I, L) to avoid confusion
 * - Produces compact, URL-safe strings
 * - Is case-insensitive for human readability
 *
 * ## Use Case
 *
 * When a client sends a message over WebSocket:
 * 1. Message is serialized to JSON string
 * 2. Hash is computed from the string
 * 3. Hash becomes the `queryId` for request/response correlation
 * 4. Server includes `queryId` in response
 * 5. Client matches response to original request
 *
 * @module utils/messageHash
 * @see {@link module:client/connection/sender} for client-side usage
 * @see {@link module:server/socket/receive} for server-side usage
 *
 * @example
 * import messageHash from './messageHash'
 *
 * const message = JSON.stringify({ type: '/chat', data: { text: 'Hello!' } })
 * const queryId = messageHash(message)
 * // queryId: 'K7M3NP2Q' (example output)
 *
 * @example
 * // Correlation pattern
 * const queryId = messageHash(serializedMessage)
 * pendingRequests[queryId] = { resolve, reject }
 * socket.send(serializedMessage)
 *
 * // Later, when response arrives:
 * socket.onmessage = (event) => {
 *   const { queryId, data } = JSON.parse(event.data)
 *   if (pendingRequests[queryId]) {
 *     pendingRequests[queryId].resolve(data)
 *     delete pendingRequests[queryId]
 *   }
 * }
 */

/**
 * Crockford Base32 alphabet
 *
 * Uses a modified Base32 alphabet that excludes visually ambiguous characters:
 * - Excludes: I, L, O, U
 * - I and L look like 1
 * - O looks like 0
 * - U can be confused with V
 *
 * This makes hashes easier to read, transcribe, and communicate verbally.
 *
 * @constant {string}
 * @see {@link https://www.crockford.com/base32.html} Crockford Base32 specification
 */
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Convert a number to Crockford Base32 string
 *
 * Recursively divides the number by 32 and builds the string
 * from the remainders. This produces a compact representation
 * that's safe for URLs and easy to read.
 *
 * ## Algorithm
 *
 * ```
 * n = 12345
 *
 * 12345 / 32 = 385 remainder 25 → 'R'
 *   385 / 32 =  12 remainder 1  → '1'
 *    12 / 32 =   0 remainder 12 → 'C'
 *
 * Result: 'C1R' (read bottom to top)
 * ```
 *
 * @param {number} n - Non-negative integer to convert
 * @returns {string} Base32 encoded string (uppercase)
 *
 * @example
 * toBase32(0)      // '0'
 * toBase32(31)     // 'Z'
 * toBase32(32)     // '10'
 * toBase32(1000)   // 'Z8'
 * toBase32(12345)  // 'C1R'
 *
 * @example
 * // Used internally by messageHash
 * const hash = jenkinsOneAtATimeHash('hello')  // Returns a large number
 * const encoded = toBase32(hash)               // Compact string representation
 */
function toBase32(n) {
  const remainder = Math.floor(n / 32);
  const current = n % 32;

  if (0 === remainder) {
    return alphabet[current];
  }

  return toBase32(remainder) + alphabet[current];
}

/**
 * Jenkins one-at-a-time hash function
 *
 * A non-cryptographic hash function designed by Bob Jenkins.
 * It provides good distribution and avalanche properties while
 * being simple and fast to compute.
 *
 * ## Properties
 *
 * - **Deterministic**: Same input always produces same output
 * - **Uniform distribution**: Output values are evenly distributed
 * - **Avalanche effect**: Small input changes cause large output changes
 * - **Fast**: Simple bitwise operations only
 *
 * ## Algorithm Steps
 *
 * For each character in the input:
 * 1. Add character code to hash
 * 2. Add (hash << 10) to hash
 * 3. XOR (hash >> 6) into hash
 *
 * Final mixing:
 * 4. Add (hash << 3) to hash
 * 5. XOR (hash >> 11) into hash
 * 6. Add (hash << 15) to hash
 * 7. Mask to 32-bit unsigned integer
 *
 * @param {string} keyString - The string to hash
 * @returns {number} 32-bit unsigned integer hash value (0 to 4,294,967,295)
 *
 * @see {@link https://en.wikipedia.org/wiki/Jenkins_hash_function} Wikipedia article
 *
 * @example
 * jenkinsOneAtATimeHash('hello')       // 1335831723
 * jenkinsOneAtATimeHash('Hello')       // 3287579938 (case sensitive)
 * jenkinsOneAtATimeHash('hello world') // 1824966837
 * jenkinsOneAtATimeHash('')            // 0
 *
 * @example
 * // Demonstrates avalanche effect
 * jenkinsOneAtATimeHash('test1')  // Very different from...
 * jenkinsOneAtATimeHash('test2')  // ...even though input differs by 1 char
 */
function jenkinsOneAtATimeHash(keyString) {
  var hash = 0;

  for (var charIndex = 0; charIndex < keyString.length; ++charIndex) {
    hash += keyString.charCodeAt(charIndex);
    hash += hash << 10;
    hash ^= hash >> 6;
  }

  hash += hash << 3;
  hash ^= hash >> 11;

  // 4,294,967,295 is 0xFFFFFFFF, the maximum 32-bit unsigned integer value
  // Used here as a mask to ensure the result is a valid 32-bit unsigned int
  // The >>> 0 converts the signed result to unsigned
  return ((hash + (hash << 15)) & 4294967295) >>> 0;
}

/**
 * Generate a Base32 hash from a message string
 *
 * This is the main export of the module. It combines the Jenkins
 * hash function with Base32 encoding to produce compact, readable
 * hash strings suitable for use as query IDs.
 *
 * ## Output Characteristics
 *
 * - **Length**: 1-7 characters (depending on hash value)
 * - **Character set**: 0-9, A-Z (excluding I, L, O, U)
 * - **Case**: Uppercase
 * - **URL-safe**: Yes
 *
 * ## Collision Probability
 *
 * With 32-bit hash space (~4 billion values), collision probability
 * follows the birthday problem:
 * - 10,000 messages: ~0.001% collision chance
 * - 100,000 messages: ~0.1% collision chance
 * - 1,000,000 messages: ~12% collision chance
 *
 * For typical api-ape usage (thousands of active requests), collisions
 * are extremely unlikely.
 *
 * @param {string} messageSt - The message string to hash (typically serialized JSON)
 * @returns {string} Base32 encoded hash string
 *
 * @example
 * // Basic usage
 * const queryId = messageHash('{"type":"/chat","data":{"text":"Hi"}}')
 * console.log(queryId)  // e.g., 'K7M3NP2Q'
 *
 * @example
 * // Request/response correlation
 * import messageHash from './messageHash'
 * import jss from './jss'
 *
 * const payload = { type: '/users', data: { action: 'list' } }
 * const message = jss.stringify(payload)
 * const queryId = messageHash(message)
 *
 * // Store pending request
 * pendingRequests.set(queryId, {
 *   resolve,
 *   reject,
 *   timeout: setTimeout(() => reject(new Error('Timeout')), 10000)
 * })
 *
 * // Send message
 * socket.send(message)
 *
 * @example
 * // Same input always produces same output
 * const msg = '{"test":true}'
 * messageHash(msg) === messageHash(msg)  // true
 *
 * @example
 * // Different inputs produce different outputs
 * messageHash('{"a":1}') !== messageHash('{"a":2}')  // true (almost always)
 */
function messageHash(messageSt) {
  return toBase32(jenkinsOneAtATimeHash(messageSt));
}

module.exports = messageHash;
