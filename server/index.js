/**
 * api-ape server entry point
 * Exports the main ape function and broadcast utilities
 */

const ape = require('./lib/main')
const { broadcast, clients } = require('./lib/broadcast')

// Attach broadcast utilities to the main function for clean exports
ape.broadcast = broadcast
ape.clients = clients

module.exports = ape

