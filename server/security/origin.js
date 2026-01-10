/**
 * @fileoverview Origin Security Check for api-ape WebSocket Connections
 *
 * This module provides Cross-Site Request Forgery (CSRF) protection for
 * WebSocket connections by validating that the request's Origin header
 * matches the server's Host header.
 *
 * ## Why Origin Validation Matters
 *
 * WebSocket connections bypass the Same-Origin Policy that protects regular
 * HTTP requests. Without origin validation, a malicious website could:
 *
 * 1. Connect to your WebSocket server from any domain
 * 2. Send requests using the victim's cookies/credentials
 * 3. Access data or perform actions as the authenticated user
 *
 * ## How It Works
 *
 * ```
 * Browser Request:
 *   Origin: https://evil.com
 *   Host: api.example.com
 *
 * Validation:
 *   extractRootDomain('https://evil.com') → 'evil.com'
 *   extractRootDomain('api.example.com')  → 'example.com'
 *   'evil.com' !== 'example.com' → REJECT
 * ```
 *
 * ## Allowed Scenarios
 *
 * | Origin               | Host                  | Result  | Reason                    |
 * |----------------------|-----------------------|---------|---------------------------|
 * | https://example.com  | api.example.com       | ✓ Allow | Same root domain          |
 * | https://app.example.com | example.com        | ✓ Allow | Same root domain          |
 * | (none)               | example.com           | ✓ Allow | No origin = same-origin   |
 * | https://evil.com     | example.com           | ✗ Reject| Different domains         |
 * | https://example.com.evil.com | example.com   | ✗ Reject| Fake subdomain attack     |
 *
 * ## Subdomains
 *
 * The validation uses root domain comparison (via `extractRootDomain`),
 * which means subdomains of the same root are allowed:
 * - `app.example.com` and `api.example.com` share root `example.com`
 * - Both are allowed to connect to each other
 *
 * @module server/security/origin
 * @see {@link module:server/security/extractRootDomain} for domain extraction
 * @see {@link module:server/socket/open} for usage in connection handling
 *
 * @example <caption>Basic Usage in Connection Handler</caption>
 * const originSecurity = require('./security/origin')
 *
 * function handleConnection(socket, req) {
 *   const isSecure = originSecurity(socket, req, (err) => {
 *     console.error('Security error:', err)
 *   })
 *
 *   if (!isSecure) {
 *     return // Connection was rejected
 *   }
 *
 *   // Continue with connection setup...
 * }
 *
 * @example <caption>Integration with api-ape</caption>
 * // This is called internally by socket/open.js
 * const isOk = originSecurity(socket, req, onError)
 *
 * if (!isOk) {
 *   // Socket was destroyed, client removed
 *   return
 * }
 *
 * // Proceed with message handling
 */

const extractRootDomain = require("./extractRootDomain");

/**
 * Get a header value from an HTTP request
 *
 * Handles both Express-style requests (with `.header()` method) and
 * raw Node.js http.IncomingMessage requests (with `.headers` object).
 *
 * @param {http.IncomingMessage|express.Request} req - HTTP request object
 * @param {string} name - Header name (case-insensitive for raw requests)
 * @returns {string|undefined} Header value, or undefined if not present
 * @private
 *
 * @example
 * // Express request
 * getHeader(expressReq, 'Origin')  // Uses req.header('Origin')
 *
 * // Raw Node.js request
 * getHeader(httpReq, 'Origin')     // Uses req.headers['origin']
 */
function getHeader(req, name) {
  // Express-style request with .header() method
  if (typeof req.header === "function") {
    return req.header(name);
  }
  // Raw Node.js http request - headers are lowercase
  return req.headers[name.toLowerCase()];
}

/**
 * Verify that request origin matches host to prevent CSRF attacks
 *
 * Compares the `Origin` header (where the request came from) with the
 * `Host` header (the server being accessed). If they don't match,
 * the connection is rejected and the socket is destroyed.
 *
 * ## Security Notes
 *
 * - **Missing Origin**: Allowed, as same-origin requests may omit Origin
 * - **Matching Root Domain**: Both headers are reduced to root domains,
 *   so `app.example.com` and `api.example.com` both match `example.com`
 * - **Socket Destruction**: Rejected connections have their socket destroyed
 *   to immediately terminate the connection
 *
 * ## When Connections Are Rejected
 *
 * - Origin domain doesn't match Host domain
 * - Potential subdomain spoofing (e.g., `example.com.evil.com`)
 *
 * ## When Connections Are Allowed
 *
 * - No Origin header (browser same-origin requests)
 * - Origin root domain matches Host root domain
 *
 * @param {WebSocket} socket - WebSocket instance (must have `.destroy()` method)
 * @param {http.IncomingMessage} req - HTTP upgrade request
 * @param {Function} [onError=console.error] - Error callback for logging rejections
 * @returns {boolean} True if origin is valid and connection should proceed,
 *                    false if connection was rejected and destroyed
 *
 * @example <caption>Basic Validation</caption>
 * const isValid = originSecurity(socket, req)
 *
 * if (!isValid) {
 *   // Socket was destroyed, connection rejected
 *   return
 * }
 *
 * // Origin is valid, proceed
 * setupMessageHandlers(socket)
 *
 * @example <caption>With Custom Error Handler</caption>
 * const isValid = originSecurity(socket, req, (errorMessage) => {
 *   logger.security.warn(errorMessage, {
 *     ip: req.socket.remoteAddress,
 *     origin: req.headers.origin,
 *     host: req.headers.host
 *   })
 * })
 *
 * @example <caption>Scenarios</caption>
 * // Scenario 1: Same domain - ALLOWED
 * // Origin: https://example.com, Host: example.com
 * // extractRootDomain → both 'example.com' → Match ✓
 *
 * // Scenario 2: Subdomain - ALLOWED
 * // Origin: https://app.example.com, Host: api.example.com
 * // extractRootDomain → both 'example.com' → Match ✓
 *
 * // Scenario 3: Different domain - REJECTED
 * // Origin: https://evil.com, Host: example.com
 * // extractRootDomain → 'evil.com' vs 'example.com' → No match ✗
 *
 * // Scenario 4: No origin - ALLOWED
 * // Origin: (not present), Host: example.com
 * // Empty origin doesn't trigger check ✓
 *
 * // Scenario 5: Spoofed subdomain - REJECTED
 * // Origin: https://example.com.evil.com, Host: example.com
 * // extractRootDomain → 'evil.com' vs 'example.com' → No match ✗
 */
module.exports = function (socket, req, onError) {
  // Default error handler to console.error if not provided
  onError = onError || console.error;

  // Extract root domains for comparison
  const origin = extractRootDomain(getHeader(req, "Origin") || "");
  const host = extractRootDomain(getHeader(req, "Host"));

  // Check for origin mismatch (only if Origin header is present)
  if (origin && origin !== host) {
    // Log the rejection
    onError(
      "REJECTING socket from " +
        getHeader(req, "Origin") +
        " mismatch with " +
        getHeader(req, "Host"),
    );

    // Destroy the socket to terminate the connection
    if (socket && socket.destroy) {
      socket.destroy();
    }

    return false;
  }

  // Origin is valid (or not present)
  return true;
};
