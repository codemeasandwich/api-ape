/**
 * api-ape server entry point
 * Exports the main ape function and broadcast utilities
 */

const ape = require('./lib/main')
const { broadcast, online, getClients } = require('./lib/broadcast')

// Attach broadcast utilities to the main function for clean exports
ape.broadcast = broadcast
ape.online = online
ape.getClients = getClients

module.exports = ape
