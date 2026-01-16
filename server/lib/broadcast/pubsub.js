/**
 * @fileoverview Pub/Sub System for api-ape Server
 *
 * Manages channel subscriptions and message publishing.
 *
 * @module server/lib/broadcast/pubsub
 * @see {@link module:server/lib/broadcast} for the main broadcast module
 */

const { _clients } = require("./clients");

/**
 * Subscription tracking for pub/sub channels
 * Maps channel name to Set of subscribed clientIds
 * @type {Map<string, Set<string>>}
 * @private
 */
const _subscriptions = new Map();

/**
 * Reverse lookup: client to their subscribed channels (for cleanup on disconnect)
 * @type {Map<string, Set<string>>}
 * @private
 */
const _clientSubscriptions = new Map();

/**
 * Last published message per channel (sent to new subscribers)
 * @type {Map<string, any>}
 * @private
 */
const _lastMessages = new Map();

/**
 * Subscribe a client to a channel
 *
 * @param {string} clientId - The client's unique identifier
 * @param {string} channel - The channel name to subscribe to
 * @returns {{channel: string, lastMessage: any}|null} Last message if exists
 */
function subscribe(clientId, channel) {
  if (!_subscriptions.has(channel)) {
    _subscriptions.set(channel, new Set());
  }
  _subscriptions.get(channel).add(clientId);

  if (!_clientSubscriptions.has(clientId)) {
    _clientSubscriptions.set(clientId, new Set());
  }
  _clientSubscriptions.get(clientId).add(channel);

  console.log(`📥 Client ${clientId} subscribed to "${channel}"`);

  if (_lastMessages.has(channel)) {
    return { channel, lastMessage: _lastMessages.get(channel) };
  }
  return null;
}

/**
 * Unsubscribe a client from a channel
 *
 * @param {string} clientId - The client's unique identifier
 * @param {string} channel - The channel name to unsubscribe from
 */
function unsubscribe(clientId, channel) {
  const subscribers = _subscriptions.get(channel);
  if (subscribers) {
    subscribers.delete(clientId);
    if (subscribers.size === 0) {
      _subscriptions.delete(channel);
    }
  }

  const clientChannels = _clientSubscriptions.get(clientId);
  if (clientChannels) {
    clientChannels.delete(channel);
    if (clientChannels.size === 0) {
      _clientSubscriptions.delete(clientId);
    }
  }

  console.log(`📤 Client ${clientId} unsubscribed from "${channel}"`);
}

/**
 * Publish a message to all subscribers of a channel
 *
 * @param {string} channel - The channel name (used as message type)
 * @param {any} data - Data payload to send
 */
function publish(channel, data) {
  _lastMessages.set(channel, data);

  const subscribers = _subscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) {
    console.log(`📣 Published to "${channel}" (0 subscribers)`);
    return;
  }

  console.log(`📣 Publishing to "${channel}" (${subscribers.size} subscribers)`);

  subscribers.forEach((clientId) => {
    const wrapper = _clients.get(clientId);
    if (wrapper) {
      wrapper.sendTo(channel, data);
    }
  });
}

/**
 * Clean up all subscriptions for a disconnected client
 *
 * @param {string} clientId - The client's unique identifier
 */
function cleanupClientSubscriptions(clientId) {
  const clientChannels = _clientSubscriptions.get(clientId);
  if (clientChannels) {
    clientChannels.forEach((channel) => {
      const subscribers = _subscriptions.get(channel);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          _subscriptions.delete(channel);
        }
      }
    });
    _clientSubscriptions.delete(clientId);
  }
}

module.exports = {
  subscribe,
  unsubscribe,
  publish,
  cleanupClientSubscriptions,
};
