/**
 * Socket open handler for api-ape
 * Validates connection origin and security before accepting
 * @module server/socket/open
 */

const originSecurity = require('../security/origin')

/**
 * Handle socket open event
 * @param {object} socket - WebSocket instance
 * @param {object} req - HTTP request object
 * @param {function} onError - Error callback
 * @returns {boolean} True if connection is valid and secure
 */
module.exports = function open(socket, req, onError) {
    const isSecure = originSecurity(socket, req, onError)
    if (!isSecure) {
        return false;
    }
    return true
}