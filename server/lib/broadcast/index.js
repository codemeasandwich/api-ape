/**
 * @fileoverview Client Tracking and Broadcast Utilities for api-ape Server
 *
 * This module provides the infrastructure for tracking connected WebSocket clients
 * and broadcasting messages to them.
 *
 * @module server/lib/broadcast
 * @see {@link module:server/lib/broadcast/clients} for client tracking
 * @see {@link module:server/lib/broadcast/pubsub} for pub/sub system
 */

const {
  clients,
  _clients,
  addClient: _addClient,
  removeClient: _removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
} = require("./clients");

const {
  subscribe,
  unsubscribe,
  publish,
  cleanupClientSubscriptions,
} = require("./pubsub");

/**
 * Add a client with pub/sub cleanup wiring
 * @param {Object} clientInfo - Client information object
 * @private
 */
function addClient(clientInfo) {
  _addClient(clientInfo);
}

/**
 * Remove a client and clean up subscriptions
 * @param {string|Object} clientIdOrInfo - Client ID or info object with clientId
 * @private
 */
function removeClient(clientIdOrInfo) {
  _removeClient(clientIdOrInfo, cleanupClientSubscriptions);
}

module.exports = {
  clients,
  publish,
  subscribe,
  unsubscribe,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
};
