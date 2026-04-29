/**
 * @fileoverview Builds the RPC send() function for the server-side api-ape client
 *
 * The send primitive serializes payloads with JSS, computes the shared Jenkins
 * query hash, installs per-request timeout and keepalive handling, and emits
 * on the active WebSocket. Extracted so `connection.js` stays under the repo
 * line-count limit while preserving the original behavior.
 *
 * @module server/client/connection-send
 */

/**
 * Creates the async `send(type, data, createdAt?)` RPC helper for an open socket.
 *
 * @param {object} deps
 * @param {typeof import("../../utils/jss")} deps.jss - JSS encode/decode
 * @param {typeof import("../../utils/messageHash")} deps.messageHash - Stable query id hashing
 * @param {Record<string, function>} deps.waitingOn - Mutable callbacks keyed by query id
 * @param {() => import("ws")|undefined} deps.getWs - Returns current WebSocket (or falsy while closed)
 * @param {number} deps.totalRequestTimeout - Max ms before rejecting outstanding RPC
 * @returns {function(string, *, number=): Promise<*>}
 */
function createSend({ jss, messageHash, waitingOn, getWs, totalRequestTimeout }) {
  /**
   * Sends a message over the WebSocket and returns a promise for the response.
   *
   * @private
   * @param {string} type - Message type (API path)
   * @param {*} data - Request payload
   * @param {number} [createdAt=Date.now()] - Epoch ms for diagnostics
   * @returns {Promise<*>} Resolves when the correlated response arrives
   */
  function send(type, data, createdAt = Date.now()) {
    const message = jss.stringify({ type, data, createdAt });
    const queryId = messageHash(message);

    return new Promise((resolve, reject) => {
      const timerRef = {};
      /**
       * Start (or restart) the response timeout timer — server keepalives defer timeout.
       * @returns {void}
       */
      const startTimer = () => {
        clearTimeout(timerRef.id);
        timerRef.id = setTimeout(() => {
          delete waitingOn[queryId];
          reject(new Error(
            `Failed to receive response for request '${type}'. ` +
              `The server did not respond within the ${totalRequestTimeout}ms timeout limit. ` +
              `To fix this, check if the server is overloaded, verify the route for '${type}' is fully implemented and returning a value, or increase the timeout limit via the APE_REQUEST_TIMEOUT environment variable (currently ${totalRequestTimeout}ms).`,
          ));
        }, totalRequestTimeout);
      };
      startTimer();

      waitingOn[queryId] = (err, result, _keepalive) => {
        if (_keepalive) {
          startTimer();
          return;
        }
        clearTimeout(timerRef.id);
        if (err) {
          reject(typeof err === "string" ? new Error(`Remote RPC error on '${type}': ${err}`) : err);
        } else {
          resolve(result);
        }
      };

      getWs().send(message);
    });
  }

  return send;
}

module.exports = { createSend };
