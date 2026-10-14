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
  // Fetch API Request (Bun): Headers has .get() and no own properties
  if (typeof req.headers.get === "function") {
    return req.headers.get(name) || undefined;
  }
  // Raw Node.js http request - headers are lowercase
  return req.headers[name.toLowerCase()];
}

/** Origin comparison strategies. */
const MODES = ["root-domain", "exact"];

/** Keys accepted in an origin policy. */
const POLICY_KEYS = ["mode", "allowedOrigins", "allowedHosts"];

/**
 * Validate and normalise an origin policy.
 *
 * @param {Object} [policy] - `{ mode, allowedOrigins, allowedHosts }`
 * @param {"root-domain"|"exact"} defaultMode - Mode used when `policy.mode` is absent
 * @returns {{mode: string, allowedOrigins: string[], allowedHosts: string[]}}
 * @throws {Error} For an unknown mode or a non-array allow list
 */
function resolveOriginPolicy(policy, defaultMode) {
  const p = policy || {};
  const unknown = Object.keys(p).filter((k) => !POLICY_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new Error(
      `api-ape: unknown origin option ${unknown.join(", ")}. Allowed: ${POLICY_KEYS.join(", ")}`,
    );
  }
  const mode = p.mode === undefined ? defaultMode : p.mode;
  if (!MODES.includes(mode)) {
    throw new Error(
      `api-ape: origin.mode must be one of ${MODES.join(", ")} (got ${JSON.stringify(mode)})`,
    );
  }
  for (const key of ["allowedOrigins", "allowedHosts"]) {
    if (p[key] !== undefined && !Array.isArray(p[key])) {
      throw new Error(`api-ape: origin.${key} must be an array of strings`);
    }
  }
  const allowedOrigins = p.allowedOrigins || [];
  const allowedHosts = p.allowedHosts || [];
  [...allowedOrigins, ...allowedHosts].forEach((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`api-ape: origin allow-list entries must be strings (got ${typeof entry})`);
    }
  });
  allowedOrigins.forEach((o) => {
    const n = normaliseOrigin(o);
    if (n !== "null" && !(n && /^https?:/.test(n))) {
      throw new Error(
        `api-ape: origin.allowedOrigins entry ${JSON.stringify(o)} must be an http(s) origin such as "http://localhost:5173" (or "null")`,
      );
    }
  });
  return { mode, allowedOrigins, allowedHosts };
}

/**
 * Normalise an Origin header value to `scheme://host[:port]` (default ports
 * dropped, host lower-cased), or `"null"` for the opaque origin.
 *
 * @param {string} value - Origin header or allow-list entry
 * @returns {string|null} Normalised origin, or null when it cannot be parsed
 * @private
 */
function normaliseOrigin(value) {
  if (value === "null") return "null";
  try {
    const u = new URL(value);
    return u.origin === "null" ? null : u.origin;
  } catch {
    return null;
  }
}

/**
 * Exact (scheme-aware, port-aware) comparison of an Origin to a Host header.
 * `http://localhost:9999` does not match Host `localhost:4318`.
 *
 * @param {string} originHeader - Origin header
 * @param {string|undefined} hostHeader - Host header
 * @returns {boolean} True when the Origin is the same origin as the Host
 * @private
 */
function exactMatch(originHeader, hostHeader) {
  if (!hostHeader) return false;
  try {
    const o = new URL(originHeader);
    if (o.protocol !== "http:" && o.protocol !== "https:") return false;
    // Re-parse the Host with the Origin's scheme so default ports compare equal
    const h = new URL(`${o.protocol}//${hostHeader}`);
    return o.host === h.host && h.pathname === "/" && !h.username;
  } catch {
    return false;
  }
}

/**
 * Decide whether a request is allowed.
 *
 * @param {Object} req - Request (any supported shape)
 * @param {Object} policy - Resolved policy
 * @returns {string|null} Refusal message, or null when allowed
 * @private
 */
function refusalReason(req, policy) {
  const originHeader = getHeader(req, "Origin");
  const hostHeader = getHeader(req, "Host");

  if (policy.allowedHosts.length > 0) {
    const host = (hostHeader || "").toLowerCase();
    if (!policy.allowedHosts.some((h) => h.toLowerCase() === host)) {
      return "REJECTING socket: Host " + hostHeader + " is not in allowedHosts";
    }
  }

  // Missing Origin: non-browser client or same-origin; nothing to compare
  if (!originHeader) return null;

  const normalised = normaliseOrigin(originHeader);
  const listed =
    normalised !== null &&
    policy.allowedOrigins.some((o) => normaliseOrigin(o) === normalised);
  if (listed) return null;

  const matches =
    policy.mode === "exact"
      ? exactMatch(originHeader, hostHeader)
      : extractRootDomain(originHeader) === extractRootDomain(hostHeader);
  if (matches) return null;

  return "REJECTING socket from " + originHeader + " mismatch with " + hostHeader;
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
 * @param {Object} [policy] - `{ mode: "root-domain"|"exact", allowedOrigins, allowedHosts }`.
 *     Defaults to the legacy `root-domain` mode (ports ignored). `exact` compares
 *     scheme-normalised host AND port; `allowedOrigins` admits extra exact origins;
 *     `allowedHosts` refuses any Host not listed (DNS-rebinding guard).
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
module.exports = function (socket, req, onError, policy) {
  // Default error handler to console.error if not provided
  onError = onError || console.error;

  const reason = refusalReason(req, resolveOriginPolicy(policy, "root-domain"));
  if (reason) {
    onError(reason);

    // Terminate the connection. Node net sockets and api-ape's own sockets have
    // destroy(); the `ws` library's WebSocket has terminate() and no destroy();
    // anything else is closed with 1008 (policy violation).
    if (socket) {
      if (typeof socket.destroy === "function") socket.destroy();
      else if (typeof socket.terminate === "function") socket.terminate();
      else if (typeof socket.close === "function") socket.close(1008, "Origin not allowed");
    }

    return false;
  }

  // Origin is valid (or not present)
  return true;
};

module.exports.resolveOriginPolicy = resolveOriginPolicy;
