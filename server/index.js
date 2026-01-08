/**
 * api-ape server entry point
 * 
 * V3 Usage:
 *   const api = require('api-ape')           // Get client proxy (default)
 *   const { ape } = require('api-ape')       // Get server/API function
 * 
 *   // ESM
 *   import api, { ape } from 'api-ape'
 * 
 * Server Setup:
 *   ape(server, { where: 'api' })            // First arg is HTTP server → setup
 * 
 * API Call:
 *   api.ape({ data: 'foo' })                 // Calls /ape endpoint
 *   // or equivalently:
 *   ape({ data: 'foo' })                     // Also calls /ape (detects it's not a server)
 * 
 * The ape function intelligently detects:
 *   - HTTP server (has .listen/.on) → Server setup mode
 *   - Anything else → API call to /ape
 */

const serverApe = require('./lib/main')
const { broadcast, clients } = require('./lib/broadcast')
const api = require('./client')
const { _queueOrSend } = require('./client')

// Attach broadcast utilities to the serverApe function
serverApe.broadcast = broadcast
serverApe.clients = clients

/**
 * Check if value looks like an HTTP server
 */
function isHttpServer(val) {
    return val && typeof val === 'object' && (
        typeof val.listen === 'function' ||
        typeof val.on === 'function' ||
        typeof val.address === 'function'
    )
}

/**
 * Dual-purpose ape function:
 * - Called with HTTP server → Setup server
 * - Called with anything else → API call to /ape
 */
function ape(firstArg, ...rest) {
    if (isHttpServer(firstArg)) {
        // Server setup mode
        return serverApe(firstArg, ...rest)
    }
    // API call mode - directly call the internal queueOrSend
    return _queueOrSend('/ape', firstArg)
}

// Copy properties from serverApe to ape
ape.broadcast = broadcast
ape.clients = clients

// Store original serverApe for direct access if needed
ape._serverApe = serverApe

// Define ape on the proxy's target so it can be destructured
// The proxy handler checks Reflect.has first, so this will be found
Object.defineProperty(api, 'ape', {
    value: ape,
    writable: false,
    enumerable: true,
    configurable: false
})

// Default export: the proxy (so const api = require('api-ape') works)
module.exports = api

// Also export named exports for ESM compatibility
module.exports.ape = ape
module.exports.api = api
module.exports.broadcast = broadcast
module.exports.clients = clients
module.exports.default = api









