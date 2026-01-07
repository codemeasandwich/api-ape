/**
 * api-ape server entry point
 * 
 * V3 Usage (100% identical on browser and server):
 *   import api from 'api-ape'
 *   api.hello('World')  // Works same on browser AND server
 *   api.on('message', (data) => console.log(data))
 * 
 * Server Setup:
 *   import api, { ape } from 'api-ape'
 *   ape(server, { where: 'api' })  // Start your server
 *   
 *   // Connect to another server (set APE_SERVER env or call api.connect)
 *   api.connect('ws://other-server:3000/api/ape')
 *   api.hello('World')
 * 
 * Supports both CommonJS and ES Modules
 */

const ape = require('./lib/main')
const { broadcast, clients } = require('./lib/broadcast')
const api = require('./client')

// Attach broadcast utilities to the ape function
ape.broadcast = broadcast
ape.clients = clients

// Default export: api client (same interface as browser)
module.exports = api

// Named exports
module.exports.ape = ape
module.exports.api = api




