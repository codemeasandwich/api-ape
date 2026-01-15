/**
 * @fileoverview Controller Context Factory for api-ape Server
 *
 * Creates the context object (`this`) available in controller invocations.
 *
 * @module server/socket/receiveContext
 * @see {@link module:server/socket/receive} for the message handler
 */

const { broadcast, clients, publish } = require("../lib/broadcast");

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
 * @returns {Object} Context object bound to `this` in controllers
 */
function createControllerContext({ sharedValues, embedValues, clientId, sessionId }) {
  return {
    ...sharedValues,
    ...embedValues,
    broadcast: (type, data) => broadcast(type, data),
    broadcastOthers: (type, data) => broadcast(type, data, clientId),
    publish: (channel, data) => publish(channel, data),
    clients,
    clientId,
    sessionId,
  };
}

module.exports = {
  getSessionId,
  createControllerContext,
};
