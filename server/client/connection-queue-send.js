/**
 * @fileoverview Queue-or-send helper for the Node api-ape client.
 *
 * Domain context: Matches browser-side queue flushing — RPC waits while offline up to connectTimeout.
 *
 * @module server/client/connection-queue-send
 */

/**
 * Send immediately when the socket is open; otherwise buffer until connect completes.
 *
 * @param {Object} ctx - Live bindings from connection.js
 * @param {function(): boolean} ctx.getReady
 * @param {function(): import('ws')|null} ctx.getWs
 * @param {typeof WebSocket} ctx.WebSocketCtor
 * @param {function(string, *): Promise<*>} ctx.send
 * @param {{push: function(*): void, splice: function(number, number): Array<*>, findIndex: function(function(*): boolean): number}} ctx.bufferedCalls
 * @param {number} ctx.connectTimeoutMs
 * @param {function(): string|null} ctx.getServerUrl
 * @param {function(): void} ctx.triggerConnect
 * @param {string} type - RPC type / path
 * @param {*} data - Payload
 * @returns {Promise<*>}
 */
function queueOrSend(ctx, type, data) {
  const ws = ctx.getWs();
  if (ctx.getReady() && ws && ws.readyState === ctx.WebSocketCtor.OPEN) {
    return ctx.send(type, data);
  }

  return new Promise((resolve, reject) => {
    const createdAt = Date.now();

    const timer = setTimeout(() => {
      const idx = ctx.bufferedCalls.findIndex((m) => m.createdAt === createdAt);
      if (idx > -1) ctx.bufferedCalls.splice(idx, 1);
      reject(
        new Error(
          `Failed to queue and send request '${type}'. ` +
            `The WebSocket connection to '${ctx.getServerUrl() || "unknown host"}' could not be established within the ${ctx.connectTimeoutMs}ms limit. ` +
            `To fix this, ensure the api-ape server is currently running on the target host and port, and check for network or firewall blockage.`,
        ),
      );
    }, ctx.connectTimeoutMs);

    ctx.bufferedCalls.push({ type, data, resolve, reject, createdAt, timer });

    if (!ws && ctx.getServerUrl()) {
      ctx.triggerConnect();
    }
  });
}

module.exports = { queueOrSend };
