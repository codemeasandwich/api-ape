/**
 * @fileoverview Shared HTTP Utilities for api-ape Server
 *
 * This module provides common HTTP utility functions used across the api-ape
 * server implementation. These utilities handle:
 *
 * - URL route matching with parameter extraction
 * - JSON response formatting
 * - Cookie parsing
 * - Security checks (localhost detection, HTTPS validation)
 * - Static file serving (client bundle and source maps)
 *
 * @module server/lib/httpUtils
 * @see {@link module:server/lib/main} - Main server module using these utilities
 * @see {@link module:server/lib/runtimes/node} - Node.js runtime using these utilities
 *
 * @example
 * const { matchRoute, sendJson, getCookie, isSecure } = require('./httpUtils')
 *
 * // Match a route with parameters
 * const params = matchRoute('/api/ape/data/abc123', '/api/ape/data/:hash')
 * console.log(params) // { hash: 'abc123' }
 *
 * // Send JSON response
 * sendJson(res, 200, { success: true })
 *
 * // Check security
 * if (!isSecure(req) && !isLocalhost(req.headers.host)) {
 *     sendJson(res, 403, { error: 'HTTPS required' })
 * }
 */

const path = require("path");
const fs = require("fs");

/**
 * Parses URL path parameters by matching against a pattern.
 *
 * Supports route patterns with colon-prefixed parameters like Express.js.
 * Returns null if the path doesn't match the pattern.
 *
 * @function matchRoute
 * @param {string} pathname - The actual URL pathname to match
 * @param {string} pattern - The route pattern with parameters (e.g., '/api/:id')
 * @returns {Object|null} Object with extracted parameters, or null if no match
 *
 * @example
 * // Basic parameter extraction
 * matchRoute('/api/users/123', '/api/users/:id')
 * // Returns: { id: '123' }
 *
 * @example
 * // Multiple parameters
 * matchRoute('/api/users/123/posts/456', '/api/users/:userId/posts/:postId')
 * // Returns: { userId: '123', postId: '456' }
 *
 * @example
 * // No match (different segment count)
 * matchRoute('/api/users', '/api/users/:id')
 * // Returns: null
 *
 * @example
 * // No match (different static segment)
 * matchRoute('/api/posts/123', '/api/users/:id')
 * // Returns: null
 */
function matchRoute(pathname, pattern) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  // Must have same number of segments
  if (patternParts.length !== pathParts.length) return null;

  const params = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      // Parameter segment - extract value
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      /* istanbul ignore next - static segment mismatch path */
      // Static segment doesn't match
      return null;
    }
  }

  return params;
}

/**
 * Sends a JSON response with the specified status code.
 *
 * Sets the Content-Type header to application/json and stringifies the data.
 *
 * @function sendJson
 * @param {http.ServerResponse} res - The HTTP response object
 * @param {number} statusCode - HTTP status code (e.g., 200, 400, 500)
 * @param {*} data - Data to JSON-stringify and send
 *
 * @example
 * // Success response
 * sendJson(res, 200, { users: [...] })
 *
 * @example
 * // Error response
 * sendJson(res, 404, { error: 'User not found' })
 *
 * @example
 * // Validation error
 * sendJson(res, 400, { error: 'Invalid input', fields: ['email'] })
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Extracts a cookie value from request headers.
 *
 * Supports both Node.js style headers (object) and Fetch API style headers
 * (Headers object with .get() method).
 *
 * @function getCookie
 * @param {Object|Headers} headers - Request headers object
 * @param {string} name - Cookie name to extract
 * @returns {string|null} Cookie value, or null if not found
 *
 * @example
 * // Node.js style headers
 * const sessionId = getCookie(req.headers, 'sessionId')
 *
 * @example
 * // Fetch API style headers
 * const sessionId = getCookie(request.headers, 'sessionId')
 *
 * @example
 * // Cookie not present
 * const missing = getCookie(req.headers, 'nonexistent')
 * // Returns: null
 */
function getCookie(headers, name) {
  // Support both Node.js style and Fetch API Headers
  const cookies =
    typeof headers.get === "function" ? headers.get("cookie") : headers.cookie;

  if (!cookies) return null;

  // Match cookie name followed by = and capture value until ; or end
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

/**
 * Checks if the host is localhost.
 *
 * Used to allow certain operations (like non-HTTPS file transfers)
 * during local development.
 *
 * Recognized localhost values:
 * - 'localhost'
 * - '127.0.0.1'
 * - '[::1]' (IPv6 localhost)
 *
 * @function isLocalhost
 * @param {string} host - Host header value (may include port)
 * @returns {boolean} True if the host is localhost
 *
 * @example
 * isLocalhost('localhost:3000')     // true
 * isLocalhost('127.0.0.1:8080')     // true
 * isLocalhost('[::1]:3000')         // true
 * isLocalhost('example.com')        // false
 * isLocalhost('192.168.1.1:3000')   // false
 */
function isLocalhost(host) {
  const hostname = host?.split(":")[0] || "";
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/**
 * Checks if the request is using HTTPS (secure connection).
 *
 * Checks multiple indicators:
 * 1. X-Forwarded-Proto header (for reverse proxies like nginx)
 * 2. Socket encryption (direct HTTPS)
 *
 * Supports both Node.js request objects and Fetch API Request objects.
 *
 * @function isSecure
 * @param {http.IncomingMessage|Request} req - The HTTP request object
 * @returns {boolean} True if the connection is secure
 *
 * @example
 * // Check if HTTPS is required
 * if (!isSecure(req) && !isLocalhost(req.headers.host)) {
 *     return sendJson(res, 403, { error: 'HTTPS required' })
 * }
 *
 * @example
 * // Behind a reverse proxy
 * // Request with header: X-Forwarded-Proto: https
 * isSecure(req) // true
 */
function isSecure(req) {
  // Fetch API style (Headers object)
  if (typeof req.headers?.get === "function") {
    return req.headers.get("x-forwarded-proto") === "https";
  }

  // Node.js style - check socket encryption or X-Forwarded-Proto
  return (
    req.socket?.encrypted || req.headers?.["x-forwarded-proto"] === "https"
  );
}

/**
 * Serves the api-ape client JavaScript bundle.
 *
 * Reads the pre-built client bundle from the dist directory and sends it
 * with the appropriate Content-Type header.
 *
 * @function serveClientBundle
 * @param {string} clientPath - The request path (used for error logging)
 * @param {http.ServerResponse} res - The HTTP response object
 *
 * @example
 * // In request handler
 * if (pathname === '/api/ape.js') {
 *     return serveClientBundle('/api/ape.js', res)
 * }
 */
/* istanbul ignore next 11 - client bundle serving only used by browser clients */
function serveClientBundle(clientPath, res) {
  const filePath = path.join(__dirname, "../../dist/ape.js");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 500, { error: "Failed to read client bundle" });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(data);
  });
}

/**
 * Serves the api-ape client source map.
 *
 * Reads the source map file from the dist directory for debugging support.
 * Returns 404 if the source map doesn't exist.
 *
 * @function serveSourceMap
 * @param {http.ServerResponse} res - The HTTP response object
 *
 * @example
 * // In request handler
 * if (pathname === '/api/ape.js.map') {
 *     return serveSourceMap(res)
 * }
 */
/* istanbul ignore next 11 - source map serving only used by browser clients */
function serveSourceMap(res) {
  const filePath = path.join(__dirname, "../../dist/ape.js.map");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Source map not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(data);
  });
}

module.exports = {
  matchRoute,
  sendJson,
  getCookie,
  isLocalhost,
  isSecure,
  serveClientBundle,
  serveSourceMap,
};
