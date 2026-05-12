/**
 * @fileoverview Pub/Sub System for api-ape Server
 *
 * Manages channel subscriptions and message publishing.
 *
 * @module server/lib/broadcast/pubsub
 * @see {@link module:server/lib/broadcast} for the main broadcast module
 */

const { apeLog } = require("../../../utils/apeLogger");
const { _clients } = require("./clients");

/**
 * Per-publish log verbosity. By default the pub/sub layer emits ONE
 * line per publish ("📣 Published to …"), which is useful during
 * channel-wiring debugging but catastrophic once a real producer (e.g.
 * a multi-GB Ollama model pull streaming NDJSON progress frames) runs
 * in a terminal that also hosts another api-ape server. Gate the log
 * behind an opt-in env var so the default posture is quiet and only
 * operators who need the trace pay the noise cost.
 *
 * Subscribe/unsubscribe logs stay on — those are one-shot lifecycle
 * events, not per-message chatter, and are valuable at session-start
 * debugging even in production.
 *
 * Evaluated lazily (per call) instead of at module load because test
 * harnesses flip the env mid-run; a one-time boot read would stick to
 * whatever the first process saw.
 *
 * @returns {boolean} True when APIAPE_PUBSUB_LOG is set to a truthy value
 *   (anything other than unset/empty/"0"/"false"/"off", case-insensitive).
 * @private
 */
function isPublishLoggingEnabled() {
  const v = process.env.APIAPE_PUBSUB_LOG;
  if (v === undefined) return false;
  const lowered = String(v).toLowerCase();
  return !(lowered === "" || lowered === "0" || lowered === "false" || lowered === "off");
}

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

  apeLog.log(`Client ${clientId} subscribed to "${channel}"`);

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

  apeLog.log(`Client ${clientId} unsubscribed from "${channel}"`);
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
    if (isPublishLoggingEnabled()) {
      apeLog.log(`Published to "${channel}" (0 subscribers)`);
    }
    return;
  }

  if (isPublishLoggingEnabled()) {
    apeLog.log(`Publishing to "${channel}" (${subscribers.size} subscribers)`);
  }

  subscribers.forEach((clientId) => {
    const wrapper = _clients.get(clientId);
    if (wrapper) {
      wrapper.send(channel, data);
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
      // DEAD `if br 1` (false): subscribe()/unsubscribe() keep
      // `_subscriptions` and `_clientSubscriptions` in lockstep — every
      // channel in clientChannels has a corresponding subscribers entry
      // until the very last client unsubscribes (at which point the
      // unsubscribe path itself removes both). So `subscribers` is always
      // truthy here. To be removed at step 7.
      /* if (subscribers) */ {
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
