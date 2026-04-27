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

const { apeLog } = require("../../../utils/apeLogger");
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
 * Broadcast a message to all currently-connected clients (no subscription required).
 *
 * `broadcast` is the canonical mechanism for "unforeseen updates / broad status
 * changes" — server-side proactive push to every connected client. It iterates
 * the local `_clients` registry and calls each `client.send(channel, data)`.
 * Unlike `publish`, broadcast does NOT require clients to issue a `{subscribe}`
 * handshake — every connected client receives the frame regardless.
 *
 * Server-to-client mechanism map:
 *   - `client.send(channel, data)` (per-client by id) — targeted push
 *   - `broadcast(channel, data, excludeClientId?)` — push to ALL clients (this fn)
 *   - `publish(channel, data)` — push to OPT-IN subscribers only
 *
 * Single-server scope: this implementation iterates the local `_clients` Map
 * only. Forest mesh deployments (multi-server) require an additional adapter
 * push (each adapter — redis/mongo/postgres/firebase/supabase — exposes
 * `channels.push('', payload)` for mesh-wide broadcast under the "ALL" key);
 * wiring that integration is a separate concern because the current api-ape
 * surface has no global "active adapter" registration. Existing llmgw +
 * other consumers run single-server today.
 *
 * @param {string} channel - The channel/type identifier carried in the frame's `type` field.
 * @param {any} data - Payload to send.
 * @param {string} [excludeClientId] - Optional clientId to skip (e.g. the originator,
 *   for `broadcastOthers` semantics). Frames are sent to every other connected client.
 * @returns {void}
 *
 * @example
 * const { broadcast } = require('api-ape');
 *
 * // Notify every connected browser of a model warmup phase change
 * broadcast('/providers/warmup/ollama/qwen', { phase: 'ready', detail: '' });
 *
 * // broadcast-to-others: skip the originator
 * broadcast('/chat/typing', { userId: 'u-42' }, 'client-abc');
 */
function broadcast(channel, data, excludeClientId) {
  // Per-client failure swallowed best-effort: a slow / dead WebSocket on
  // one client should never block delivery to the rest. Mirrors the
  // resilience of the prior llmgw manual `client.send()` loop this
  // function replaces.
  for (const [id, client] of _clients) {
    if (id === excludeClientId) continue;
    try {
      client.send(channel, data);
    } catch (e) {
      /* istanbul ignore next */
      apeLog.error(
        `broadcast send failed for ${id}:`,
        e && e.message ? e.message : e,
      );
    }
  }
}

/**
 * Broadcast a message to all clients EXCEPT the supplied id.
 *
 * Convenience wrapper around `broadcast(channel, data, excludeClientId)`
 * that mirrors the controller-context `this.broadcastOthers` semantic
 * documented in `loader.js` / `postHandler.js`. Equivalent to passing the
 * third argument; provided as a named export for caller-site clarity.
 *
 * @param {string} channel - Channel/type identifier.
 * @param {any} data - Payload.
 * @param {string} excludeClientId - Required clientId to skip.
 * @returns {void}
 *
 * @example
 * const { broadcastOthers } = require('api-ape');
 * broadcastOthers('/chat/typing', { userId: 'u-42' }, 'client-abc');
 */
function broadcastOthers(channel, data, excludeClientId) {
  return broadcast(channel, data, excludeClientId);
}

module.exports = {
  clients,
  publish,
  broadcast,
  broadcastOthers,
  subscribe,
  unsubscribe,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
};
