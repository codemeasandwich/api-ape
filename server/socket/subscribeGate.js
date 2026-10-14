/**
 * @fileoverview Subscribe authorisation for one connection (`onSubscribe`, 4.5.0).
 *
 * Domain context: a `{ subscribe: channel }` frame used to record the subscription and
 * replay the channel's retained last message to any client that could open a socket. The
 * app now supplies `onSubscribe(channel, context)` to say who may have which channel.
 *
 * Technical context: one gate per connection, created by `receive.js`. With no
 * `onSubscribe` the gate does exactly what 4.4.0 did (subscribe, replay at once). With one
 * it asks first, and records the subscription and replays the retained message only after
 * the answer is exactly `true`. Anything else (false, a throw, a rejection, a truthy
 * non-boolean, undefined, a non-string channel) is a refusal: fail closed. A refusal also
 * drops a subscription the client already held on that channel, and sends the client a
 * `__subscribe_refused__` frame (an error frame: `err` is an Error, `errCode` is
 * `SUBSCRIBE_REFUSED`, `errData` is `{ channel }`; no cause is sent, because a guard's
 * exception can name a database or a token).
 *
 * The answer may arrive late. Two things can happen meanwhile and both must win over the
 * answer: the client unsubscribes (or subscribes again, whose answer then decides), or the
 * socket closes (its subscriptions were already cleaned up; recording one now would leave
 * a subscription for a dead client that a resumed connection with the same clientId would
 * inherit). Each pending channel therefore holds a token, replaced by a newer subscribe
 * and cleared by an unsubscribe or by close; an answer that finds a different token is
 * dropped.
 *
 * @module server/socket/subscribeGate
 * @see {@link module:server/socket/receive} which routes `{ subscribe }` / `{ unsubscribe }` here
 * @see {@link module:server/lib/broadcast/pubsub} for the subscription store
 */

const { apeLog } = require("../../utils/apeLogger");
const { subscribe, unsubscribe } = require("../lib/broadcast");

/** Frame `type` of the refusal a client receives. */
const REFUSED_TYPE = "__subscribe_refused__";

/** `errCode` of the refusal. */
const REFUSED_CODE = "SUBSCRIBE_REFUSED";

/**
 * Create the subscribe handler for one connection.
 *
 * @param {Object} connection - What the connection knows
 * @param {Function} [connection.onSubscribe] - The app's guard `(channel, context) => boolean | Promise<boolean>`
 * @param {Object} [connection.socket] - The socket; its `close` ends pending checks
 * @param {Function} connection.send - The connection's sender `(queryId, type, data, err)`
 * @param {string} connection.clientId - This connection's client id
 * @param {string|null} connection.sessionId - Its session id (what controllers see as `this.sessionId`)
 * @param {Object} [connection.embedValues] - What `onConnect` embedded
 * @returns {{subscribe: function(any): void, unsubscribe: function(any): void}} Handlers for the two frames
 */
function createSubscribeGate({ onSubscribe, socket, send, clientId, sessionId, embedValues }) {
  /** @type {Map<any, Object>} channel to the token of its pending check */
  const pending = new Map();
  let closed = false;
  if (onSubscribe && socket && typeof socket.on === "function") {
    socket.on("close", () => {
      closed = true;
      pending.clear();
    });
  }

  /**
   * Record the subscription and replay the retained message, as 4.4.0 did.
   *
   * @param {any} channel - Channel the client asked for
   * @returns {void}
   */
  function admit(channel) {
    const result = subscribe(clientId, channel);
    if (result?.lastMessage) {
      try {
        send(false, result.channel, result.lastMessage, false);
      } catch (sendErr) {
        // Socket likely closed
      }
    }
  }

  /**
   * Tell the client no, and drop any subscription it already held on the channel.
   *
   * @param {any} channel - Channel the client asked for
   * @returns {void}
   */
  function refuse(channel) {
    const named = typeof channel === "string";
    if (named) unsubscribe(clientId, channel);
    const err = new Error(named ? `Subscription to "${channel}" refused` : "Subscription refused: the channel must be a string");
    err.code = REFUSED_CODE;
    err.data = named ? { channel } : {};
    try {
      send(false, REFUSED_TYPE, false, err);
    } catch (sendErr) {
      // Socket likely closed
    }
  }

  /**
   * Ask the app. Only `true` admits.
   *
   * @param {any} channel - Channel the client asked for
   * @returns {Promise<boolean>} Whether the app said yes
   */
  async function allowed(channel) {
    if (typeof channel !== "string") return false;
    try {
      return (await onSubscribe(channel, { clientId, sessionId, embed: embedValues || {} })) === true;
    } catch (err) {
      apeLog.error(`[api-ape] onSubscribe failed for client ${clientId} on ${JSON.stringify(channel)}, refusing: ${(err && err.message) || err}`);
      return false;
    }
  }

  return {
    /**
     * Handle `{ subscribe: channel }`.
     *
     * @param {any} channel - Channel the client asked for
     * @returns {void}
     */
    subscribe(channel) {
      if (!onSubscribe) return admit(channel);
      const token = {};
      pending.set(channel, token);
      allowed(channel).then((yes) => {
        if (closed || pending.get(channel) !== token) return;
        pending.delete(channel);
        if (yes) admit(channel);
        else refuse(channel);
      });
    },

    /**
     * Handle `{ unsubscribe: channel }`: also cancels a check still pending.
     *
     * @param {any} channel - Channel the client leaves
     * @returns {void}
     */
    unsubscribe(channel) {
      pending.delete(channel);
      unsubscribe(clientId, channel);
    },
  };
}

module.exports = { createSubscribeGate, REFUSED_TYPE, REFUSED_CODE };
