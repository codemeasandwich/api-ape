/**
 * api-ape unified entry point
 * 
 * V3 Server Usage:
 *   const api = require('api-ape')              // Client factory (default)
 *   const { ape } = require('api-ape')          // Server initializer (named)
 *   import api, { ape } from 'api-ape'          // ESM both
 * 
 * Browser Usage:
 *   import api from 'api-ape'                   // Auto-connecting client
 */

let apiApe;

if ('undefined' === typeof window
  || 'undefined' === typeof window.document) {
  // Server environment - exports: api (default), ape, broadcast, clients, createClient
  apiApe = require('./server');
} else {
  // Browser environment - client module has its own exports
  apiApe = require('./client');
}

module.exports = apiApe


