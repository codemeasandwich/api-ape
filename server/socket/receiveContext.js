/**
 * @fileoverview Controller Context Factory for api-ape Server
 *
 * Creates the context object (`this`) available in controller invocations.
 *
 * @module server/socket/receiveContext
 * @see {@link module:server/socket/receive} for the message handler
 */

const { clients, publish, clearLastMessage, broadcast, broadcastOthers } = require("../lib/broadcast");
const { parseSessionIdFromReq } = require("../lib/sessionIdentity");

/**
 * Extract the session ID from the request (`sessionId` cookie, else the
 * `x-ape-session-id` header).
 *
 * @param {http.IncomingMessage} req - The HTTP request object
 * @returns {string|null} The session ID if found, null otherwise
 */
function getSessionId(req) {
  if (!req || !req.headers) return null;
  // Same parser the wiring layer uses, so `this.sessionId` equals the session
  // the connection was paired with (cookie anywhere in the header, or
  // `x-ape-session-id`).
  return parseSessionIdFromReq(req);
}

/**
 * Create the context object for controller invocations
 *
 * Controllers can access these values using `this.propertyName`.
 *
 * @param {Object} options - Context options
 * @param {Object} options.sharedValues - Shared values (socket, req, agent, send)
 * @param {Object} options.embedValues - Custom values from onConnect
 * @param {string} options.clientId - This client's unique identifier
 * @param {string|null} options.sessionId - Session ID from cookies
 * @param {Object} [options.socketAuth] - Socket auth manager instance
 * @returns {Object} Context object bound to `this` in controllers
 */
function createControllerContext({ sharedValues, embedValues, clientId, sessionId, socketAuth }) {
  const context = {
    ...sharedValues,
    // Push `type` to every connected client / to every client except the caller.
    // Declared BEFORE the app's embed so an app that embeds its own `broadcast`
    // keeps it (these names are new in 4.4.0; an app may already use them).
    broadcast: (type, data) => broadcast(type, data),
    broadcastOthers: (type, data) => broadcastOthers(type, data, clientId),
    ...embedValues,
    publish: (channel, data) => publish(channel, data),
    clearLastMessage: (channel) => clearLastMessage(channel),
    clients,
    clientId,
    sessionId,
  };

  // Add auth-related properties if auth is configured
  if (socketAuth) {
    Object.defineProperty(context, "isAuthenticated", {
      /**
       * Check if the current connection is authenticated
       * @returns {boolean} Whether connection is authenticated
       */
      get() {
        return socketAuth.isAuthenticated();
      },
      enumerable: true,
    });

    Object.defineProperty(context, "authTier", {
      /**
       * Get the current authentication tier (0-3)
       * @returns {number} Auth tier from 0 (guest) to 3 (high security)
       */
      get() {
        return socketAuth.getTier();
      },
      enumerable: true,
    });

    Object.defineProperty(context, "principal", {
      /**
       * Get the authenticated principal (user info)
       * @returns {Object|null} Principal object or null if not authenticated
       */
      get() {
        const state = socketAuth.getState();
        return state.principal;
      },
      enumerable: true,
    });

    Object.defineProperty(context, "authState", {
      /**
       * Get the full auth state
       * @returns {Object} Complete auth state object
       */
      get() {
        return socketAuth.getState();
      },
      enumerable: true,
    });

    /**
     * Check if socket meets a minimum tier requirement
     * @param {number} requiredTier - Minimum required tier
     * @returns {boolean} Whether requirement is met
     */
    context.requiresTier = (requiredTier) => {
      return socketAuth.meetsRequirement(requiredTier);
    };
  } else {
    // Provide default values when auth is not configured
    context.isAuthenticated = false;
    context.authTier = 0;
    context.principal = null;
    context.authState = null;
    context.requiresTier = () => false;
  }

  return context;
}

/**
 * The `this` for ONE call: the connection's context with the call's own `keepalive`.
 *
 * Layered with `Object.create` so `this.keepalive` and `this._currentQueryId` belong to
 * THIS call. A shared context let a second concurrent call overwrite the first one's
 * keepalive, so the first one's frames carried the second one's queryId, and a
 * `this.foo = x` made by one call was visible to the next. Used by the WebSocket and the
 * HTTP long-poll paths alike, so a controller behaves the same on either transport.
 *
 * @param {Object} connectionContext - From `createControllerContext`
 * @param {string} queryId - The call being served
 * @param {function(string, boolean, boolean, boolean, boolean): void} send - The connection's
 *   sender; called as `send(queryId, false, false, false, true)` for a keepalive
 * @returns {Object} Context for `controller.call(context, data)`
 */
function createCallContext(connectionContext, queryId, send) {
  const callContext = Object.create(connectionContext);
  callContext._currentQueryId = queryId;
  // Long-running controllers call this.keepalive() periodically to send a heartbeat
  // that resets the client's RPC timeout timer without resolving the call.
  callContext.keepalive = () => {
    try {
      send(queryId, false, false, false, true);
    } catch (_) { /* socket may be closed */ }
  };
  return callContext;
}

module.exports = {
  getSessionId,
  createControllerContext,
  createCallContext,
};
