/**
 * @fileoverview Replay Attack Prevention for api-ape Server
 *
 * This module provides protection against replay attacks on WebSocket messages.
 * Replay attacks occur when an attacker intercepts valid messages and resends
 * them to perform unauthorized actions.
 *
 * ## How Replay Attacks Work
 *
 * ```
 * Normal Request:
 * Client ──────► Server
 *   { type: '/transfer', data: { amount: 100 } }
 *
 * Replay Attack:
 * Attacker captures message and resends it multiple times:
 * Attacker ──────► Server (same message)
 * Attacker ──────► Server (same message)
 * Attacker ──────► Server (same message)
 * Result: Multiple transfers instead of one!
 * ```
 *
 * ## Protection Mechanism
 *
 * This module prevents replay attacks using two strategies:
 *
 * ### 1. Request ID Tracking
 *
 * Each message has a unique queryId generated from its content hash.
 * The server tracks recently seen queryIds and rejects duplicates.
 *
 * ```
 * Request 1: queryId = "K7M3NP" ✓ (new, allowed)
 * Request 2: queryId = "K7M3NP" ✗ (duplicate, rejected)
 * Request 3: queryId = "X9W2QR" ✓ (new, allowed)
 * ```
 *
 * ### 2. Timestamp Validation
 *
 * Messages include a `createdAt` timestamp. The server rejects messages that:
 * - Are too old (> 10 seconds in the past)
 * - Are from the future (clock skew attack)
 *
 * ```
 * Server Time: 12:00:00
 *
 * createdAt: 11:59:55 ✓ (5 seconds ago, valid)
 * createdAt: 11:59:45 ✗ (15 seconds ago, too old)
 * createdAt: 12:00:05 ✗ (5 seconds in future, invalid)
 * ```
 *
 * ## Window Management
 *
 * The request tracking window is limited to 10 seconds worth of requests.
 * Older entries are automatically purged to prevent memory growth.
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────┐
 * │                    10-second Window                          │
 * │                                                              │
 * │  [old requests purged] ← ─ ─ ─ [tracked requests] ─ ─ ─ → [now] │
 * │                                                              │
 * │  Requests older than 10 seconds are removed from tracking   │
 * │  New duplicates within window are rejected                  │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Per-Connection Isolation
 *
 * Each WebSocket connection gets its own replay checker instance.
 * This provides:
 * - Isolation between clients (one client's requests don't affect another)
 * - Automatic cleanup when connection closes
 * - Memory efficiency (only tracks requests for active connections)
 *
 * @module server/security/reply
 * @see {@link module:server/socket/receive} for usage in message handling
 * @see {@link module:utils/messageHash} for queryId generation
 *
 * @example <caption>Creating a Replay Checker</caption>
 * const replySecurity = require('./reply')
 *
 * // Create checker for a connection
 * const checkReply = replySecurity()
 *
 * // In message handler
 * try {
 *   checkReply(queryId, createdAt)
 *   // Request is valid - process it
 * } catch (err) {
 *   // Request is invalid - replay or expired
 *   console.error('Replay attack or stale request:', err.message)
 * }
 *
 * @example <caption>Integration with Socket Receive</caption>
 * // In wiring.js
 * const checkReply = replySecurity()
 *
 * socket.on('message', async (msg) => {
 *   const { queryId, createdAt, type, data } = parseMessage(msg)
 *
 *   try {
 *     checkReply(queryId, createdAt)
 *     const result = await controllers[type](data)
 *     send(queryId, null, result, null)
 *   } catch (err) {
 *     send(queryId, null, null, err)
 *   }
 * })
 *
 * @example <caption>Error Messages</caption>
 * // Future timestamp
 * checkReply('abc', Date.now() + 60000)
 * // Throws: "createdAt ahead of server by 60 secs"
 *
 * // Old timestamp
 * checkReply('abc', Date.now() - 30000)
 * // Throws: "request is old by 30 secs"
 *
 * // Duplicate request
 * checkReply('abc', Date.now())  // First call - OK
 * checkReply('abc', Date.now())  // Second call
 * // Throws: "Reply: abc"
 */

/**
 * Create a replay attack checker for a WebSocket connection
 *
 * Returns a function that validates incoming requests against:
 * - Previously seen request IDs (prevents duplicates)
 * - Request timestamps (prevents stale/future requests)
 *
 * Each checker maintains its own request history, isolated from other
 * connections. The history is automatically pruned to only keep requests
 * from the last 10 seconds.
 *
 * @returns {function(string, number): void} Check function that throws on invalid requests
 *
 * @example
 * // Create a checker for this connection
 * const checkReply = replySecurity()
 *
 * // Check a request (throws if invalid)
 * checkReply('queryId123', Date.now())
 *
 * // Same queryId again - throws
 * try {
 *   checkReply('queryId123', Date.now())
 * } catch (err) {
 *   console.log(err.message)  // "Reply: queryId123"
 * }
 */
module.exports = function () {
  /**
   * Array of recently seen requests
   *
   * Each entry is a tuple of [queryId, createdAt timestamp].
   * Entries older than 10 seconds are pruned on each check.
   *
   * @type {Array<[string, number]>}
   * @private
   */
  let requestCheck = [];

  /**
   * Validate a request against replay attacks
   *
   * Performs three validations:
   * 1. **Future check**: Rejects if createdAt is ahead of server time
   * 2. **Staleness check**: Rejects if createdAt is more than 10 seconds old
   * 3. **Duplicate check**: Rejects if queryId was seen in the last 10 seconds
   *
   * If validation passes, the request is added to the tracking list.
   *
   * ## Time Tolerance
   *
   * The 10-second window provides:
   * - Tolerance for minor network latency
   * - Tolerance for minor clock skew between client and server
   * - Protection against replay attacks (attacker must replay within 10 seconds)
   * - Memory efficiency (limited tracking window)
   *
   * @param {string} queryId - Unique request identifier (hash of message content)
   * @param {number} createdAt - Timestamp when the request was created (client-side)
   * @throws {Error} If request is from the future (clock skew)
   * @throws {Error} If request is too old (> 10 seconds)
   * @throws {Error} If request is a duplicate (same queryId within window)
   *
   * @example
   * // Valid request
   * checkReply('K7M3NP2Q', Date.now() - 1000)  // 1 second ago - OK
   *
   * @example
   * // Future request (clock skew or tampering)
   * checkReply('K7M3NP2Q', Date.now() + 5000)
   * // Error: "createdAt ahead of server by 5 secs"
   *
   * @example
   * // Stale request
   * checkReply('K7M3NP2Q', Date.now() - 15000)
   * // Error: "request is old by 15 secs"
   *
   * @example
   * // Duplicate request (replay attack)
   * checkReply('K7M3NP2Q', Date.now())  // First - OK
   * checkReply('K7M3NP2Q', Date.now())  // Second - Error
   * // Error: "Reply: K7M3NP2Q"
   */
  return (queryId, createdAt) => {
    /**
     * Current server timestamp
     * @type {number}
     */
    const startTime = Date.now();

    /**
     * Check 1: Reject requests from the future
     *
     * This catches:
     * - Client clock running ahead
     * - Timestamp manipulation attacks
     * - Replay of pre-generated future requests
     */
    if (createdAt > startTime) {
      const skewSeconds = (createdAt - startTime) / 1000;
      throw new Error(
        `createdAt ahead of server by ${skewSeconds} secs. Request rejected.`,
      );
    }

    /**
     * Calculate the cutoff time (10 seconds ago)
     * Requests older than this are considered stale
     * @type {number}
     */
    const tenSecAgo = startTime - 10000;

    /**
     * Check 2: Reject stale requests
     *
     * This catches:
     * - Slow replay attacks
     * - Network issues causing extreme delays
     * - Replay of old captured requests
     */
    if (createdAt < tenSecAgo) {
      const staleSeconds = (startTime - createdAt) / 1000;
      throw new Error(
        `request is old by ${staleSeconds} secs. Request rejected.`,
      );
    }

    /**
     * Check 3: Reject duplicates and prune old entries
     *
     * Filter the request history to:
     * 1. Check if this queryId was already seen (throws if found)
     * 2. Remove entries older than 10 seconds (memory cleanup)
     *
     * This single pass efficiently handles both operations.
     */
    requestCheck = requestCheck.filter(([passQueryId, createdWhen]) => {
      // If we find the same queryId, it's a replay attack
      if (passQueryId === queryId) {
        throw new Error(`Reply: ${queryId} - Duplicate request rejected.`);
      }
      // Keep entries that are still within the 10-second window
      return createdWhen > tenSecAgo;
    });

    /**
     * Request passed all checks - add to tracking list
     *
     * Store [queryId, createdAt] for future duplicate detection.
     * This entry will be automatically pruned after 10 seconds.
     */
    requestCheck.push([queryId, createdAt]);
  };
};
