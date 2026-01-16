/**
 * @fileoverview Socket Open Handler - Connection Validation Gateway
 *
 * This module provides the entry point handler for new WebSocket connections.
 * It acts as a security gateway, validating the connection origin and enforcing
 * security policies before allowing the connection to proceed.
 *
 * ## Purpose
 *
 * When a new WebSocket connection is initiated, this handler:
 * 1. Receives the socket and HTTP upgrade request
 * 2. Delegates to origin security validation
 * 3. Returns whether the connection should be accepted or rejected
 *
 * ## Security Flow
 *
 * ```
 * Client Connect → open() → originSecurity() → Accept/Reject
 *                              ↓
 *                    - Validates Origin header
 *                    - Checks domain allowlist
 *                    - Prevents CSRF attacks
 * ```
 *
 * ## Integration
 *
 * This handler is called by the wiring layer when a new WebSocket
 * connection is received. It's the first line of defense against
 * unauthorized or malicious connections.
 *
 * @module server/socket/open
 * @see {@link module:server/security/origin} - Origin validation implementation
 * @see {@link module:server/lib/wiring} - Wiring layer that calls this handler
 *
 * @example
 * // Used internally by wiring layer
 * const open = require('./socket/open')
 *
 * wss.on('connection', (socket, req) => {
 *     const isValid = open(socket, req, (error) => {
 *         console.error('Connection rejected:', error)
 *     })
 *
 *     if (!isValid) {
 *         socket.close(1008, 'Security policy violation')
 *         return
 *     }
 *
 *     // Connection accepted, continue with setup...
 * })
 *
 * @example
 * // Error callback receives security violation details
 * open(socket, req, (error) => {
 *     console.error('Security violation:', error.message)
 *     // Log for security monitoring
 *     securityLog.warn({
 *         type: 'connection_rejected',
 *         origin: req.headers.origin,
 *         ip: req.socket.remoteAddress,
 *         reason: error.message
 *     })
 * })
 */

const originSecurity = require("../security/origin");

/**
 * Handle socket open event and validate connection security.
 *
 * This function is the first handler called when a new WebSocket
 * connection is established. It validates the connection against
 * security policies (primarily origin validation) and returns
 * whether the connection should be accepted.
 *
 * ## Security Checks
 *
 * - **Origin Validation**: Ensures the Origin header matches allowed domains
 * - **CSRF Prevention**: Blocks cross-origin requests from untrusted sources
 * - **Protocol Compliance**: Validates WebSocket upgrade request format
 *
 * ## Failure Handling
 *
 * When validation fails:
 * 1. The onError callback is invoked with error details
 * 2. The function returns `false`
 * 3. The caller is responsible for closing the socket
 *
 * ## Success Flow
 *
 * When validation succeeds:
 * 1. The function returns `true`
 * 2. The caller can proceed with connection setup
 * 3. No error callback is invoked
 *
 * @function open
 * @param {Object} socket - WebSocket instance (from WebSocketServer)
 * @param {http.IncomingMessage} req - HTTP upgrade request object
 * @param {function(Error): void} onError - Callback invoked on security failure
 * @returns {boolean} True if connection is valid and secure, false otherwise
 *
 * @example
 * // Basic usage in connection handler
 * const isSecure = open(socket, req, (err) => {
 *     console.error('Connection failed security check:', err)
 * })
 *
 * if (!isSecure) {
 *     return // Connection will be terminated
 * }
 *
 * // Safe to proceed with connection setup
 * setupConnection(socket, req)
 *
 * @example
 * // With detailed error handling
 * const isSecure = open(socket, req, (error) => {
 *     // Log security event
 *     logger.security('connection_rejected', {
 *         origin: req.headers.origin,
 *         host: req.headers.host,
 *         ip: req.socket.remoteAddress,
 *         userAgent: req.headers['user-agent'],
 *         error: error.message
 *     })
 *
 *     // Optionally notify security monitoring
 *     if (isRateLimitExceeded(req.socket.remoteAddress)) {
 *         alertSecurityTeam('Possible attack detected')
 *     }
 * })
 *
 * @example
 * // In wiring layer integration
 * function handleConnection(socket, req) {
 *     // First, validate security
 *     if (!open(socket, req, handleSecurityError)) {
 *         socket.close(1008, 'Policy violation')
 *         return null
 *     }
 *
 *     // Connection is secure, create session
 *     const session = createSession(socket, req)
 *     return session
 * }
 */
module.exports = function open(socket, req, onError) {
  // Delegate to origin security for validation
  const isSecure = originSecurity(socket, req, onError);

  if (!isSecure) {
    return false;
  }

  return true;
};
