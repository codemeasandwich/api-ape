/**
 * Origin security check for api-ape WebSocket connections
 * Prevents CSRF attacks by validating Origin against Host header
 * @module server/security/origin
 */

const extractRootDomain = require('./extractRootDomain')

/**
 * Get header value (works with both Express and raw Node.js)
 * @param {object} req - HTTP request object
 * @param {string} name - Header name
 * @returns {string|undefined} Header value
 */
function getHeader(req, name) {
  // Express-style
  if (typeof req.header === 'function') {
    return req.header(name)
  }
  // Raw Node.js http request
  return req.headers[name.toLowerCase()]
}

/**
 * Verify that request origin matches host to prevent CSRF attacks
 * @param {object} socket - WebSocket instance
 * @param {object} req - HTTP request object
 * @param {function} [onError] - Error callback (defaults to console.error)
 * @returns {boolean} True if origin is valid, false if connection was rejected
 */
module.exports = function (socket, req, onError) {
  onError = onError || console.error
  const origin = extractRootDomain(getHeader(req, 'Origin') || "")
  const host = extractRootDomain(getHeader(req, 'Host'))
  if (origin && origin !== host) {
    onError("REJECTING socket from " + getHeader(req, 'Origin') + " miss-match with " + getHeader(req, 'Host'))
    if (socket && socket.destroy) {
      socket.destroy()
    }
    return false
  }
  return true
}