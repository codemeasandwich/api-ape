/**
 * @fileoverview Subscription Manager for api-ape Client
 *
 * Manages channel subscriptions for the chained subscription syntax.
 * Tracks local callbacks, sends subscribe/unsubscribe messages to server,
 * and handles reconnection re-subscription.
 *
 * @module client/connection/subscriptions
 *
 * @example
 * // Subscribe to a channel
 * const unsub = subscribe('/news/banking', (data) => {
 *   console.log('Received:', data)
 * }, sendFn)
 *
 * // Unsubscribe
 * unsub()
 */

import { apeLog } from "../../utils/apeLogger.js";

/**
 * Map of channel to Set of callback functions
 * @type {Map<string, Set<Function>>}
 * @private
 */
const subscriptions = new Map();

/**
 * Reference to the send function (set during integration)
 * @type {Function|null}
 * @private
 */
let _sendFn = null;

/**
 * Set the send function used for subscribe/unsubscribe messages
 *
 * @param {Function} sendFn - Function that sends raw messages to server
 */
export function setSendFn(sendFn) {
  _sendFn = sendFn;
}

/**
 * Subscribe to a channel with a callback
 *
 * @param {string} channel - The channel path (e.g., '/news/banking')
 * @param {Function} callback - Function to call when data is published
 * @returns {Function} Unsubscribe function
 *
 * @example
 * const unsub = subscribe('/news/banking', (data) => {
 *   console.log(data.headline)
 * })
 *
 * // Later: unsubscribe
 * unsub()
 */
export function subscribe(channel, callback) {
  // Get or create the callback set for this channel
  let callbacks = subscriptions.get(channel);
  const isFirstSubscriber = !callbacks;

  if (isFirstSubscriber) {
    callbacks = new Set();
    subscriptions.set(channel, callbacks);
  }

  // Add the callback
  callbacks.add(callback);

  // If first subscriber, send subscribe message to server
  if (isFirstSubscriber && _sendFn) {
    _sendFn({ subscribe: channel });
  }

  // Return unsubscribe function
  return function unsubscribe() {
    const cbs = subscriptions.get(channel);
    if (cbs) {
      cbs.delete(callback);

      // If no more callbacks, unsubscribe from server
      if (cbs.size === 0) {
        subscriptions.delete(channel);
        if (_sendFn) {
          _sendFn({ unsubscribe: channel });
        }
      }
    }
  };
}

/**
 * Check if a channel has any subscribers
 *
 * @param {string} channel - The channel path
 * @returns {boolean} True if channel has subscribers
 */
export function hasSubscribers(channel) {
  return subscriptions.has(channel) && subscriptions.get(channel).size > 0;
}

/**
 * Dispatch incoming data to all subscribers of a channel
 *
 * @param {string} channel - The channel that received data
 * @param {any} data - The data payload from the server
 */
export function dispatch(channel, data) {
  const callbacks = subscriptions.get(channel);
  if (callbacks) {
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        apeLog.error(`Subscription callback error for "${channel}":`, err);
      }
    });
  }
}

/**
 * Re-subscribe to all active channels
 *
 * Called on reconnection to restore all subscriptions.
 */
export function resubscribeAll() {
  if (!_sendFn) return;

  subscriptions.forEach((callbacks, channel) => {
    if (callbacks.size > 0) {
      _sendFn({ subscribe: channel });
    }
  });
}

/**
 * Get all active channel names (for debugging/testing)
 *
 * @returns {string[]} Array of subscribed channel names
 */
export function getActiveChannels() {
  return Array.from(subscriptions.keys());
}

/**
 * Clear all subscriptions (for testing)
 */
export function clearAll() {
  subscriptions.clear();
}
