/**
 * @fileoverview Controller Context Factory for api-ape Server
 *
 * Creates the context object (`this`) available in controller invocations.
 *
 * @module server/socket/receiveContext
 * @see {@link module:server/socket/receive} for the message handler
 */

const { clients, publish } = require("../lib/broadcast");

/**
 * Extract session ID from request cookies
 *
 * @param {http.IncomingMessage} req - The HTTP request object
 * @returns {string|null} The session ID if found, null otherwise
 */
function getSessionId(req) {
  const cookies = req?.headers?.cookie || "";
  const match = cookies.match(/(?:^|;\\s*)sessionId=([^;]*)/);
  return match ? match[1] : null;
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
    ...embedValues,
    publish: (channel, data) => publish(channel, data),
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

module.exports = {
  getSessionId,
  createControllerContext,
};
