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

/**
 * Broadcast a message to all connected clients
 *
 * @param {string} type - Message type identifier
 * @param {any} data - Data payload to send
 * @param {string} [excludeClientId] - Optional clientId to exclude
 */
function broadcast(type, data, excludeClientId) {
  console.log(
    `📢 Broadcasting "${type}" to ${_clients.size} clients`,
    excludeClientId ? `(excluding ${excludeClientId})` : "",
  );

  _clients.forEach((wrapper, clientId) => {
    if (excludeClientId && clientId === excludeClientId) {
      return;
    }
    wrapper.sendTo(type, data);
  });
}

module.exports = {
  clients,
  broadcast,
  publish,
  subscribe,
  unsubscribe,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
};
