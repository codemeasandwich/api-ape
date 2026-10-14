/**
 * @fileoverview A raw-socket api-ape client for the call-contract stories.
 *
 * Speaks the wire protocol directly (`{type, data, createdAt}` frames, queryId =
 * messageHash of the message) so a story can see EVERY frame the server sends for a
 * call, which the real clients hide (keepalive frames, error frames).
 *
 * @module simulator/scenarios/stories/call-contract/raw-client
 */

const WebSocket = require("ws");
const jss = require("../../../../utils/jss");
const messageHash = require("../../../../utils/messageHash");

/**
 * Open a raw socket to a harness server and collect every frame it sends.
 *
 * @param {{wsUrl: string, apiPath: string}} server - Harness server instance
 * @returns {Promise<{frames: Array<Object>, call: function(string, any): string, framesFor: function(string): Array<Object>, reply: function(string, number=): Promise<Object>, close: function(): void}>}
 *   Client with `call(type, data)` returning the queryId, `framesFor(queryId)`, and `reply(queryId)`
 */
async function connectRaw(server) {
  const ws = new WebSocket(`${server.wsUrl}/${server.apiPath}/ape`);
  const frames = [];
  ws.on("message", (raw) => frames.push(jss.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  /**
   * Send one call.
   *
   * @param {string} type - Endpoint, e.g. `slow`
   * @param {any} data - Payload
   * @returns {string} The queryId the server will answer on
   */
  function call(type, data) {
    const message = jss.stringify({ type, data, createdAt: new Date(), requestedAt: new Date() });
    const queryId = messageHash(message);
    ws.send(message);
    return queryId;
  }

  /**
   * Every frame the server has sent for one call so far.
   *
   * @param {string} queryId - From `call`
   * @returns {Array<Object>} Frames in arrival order
   */
  function framesFor(queryId) {
    return frames.filter((frame) => frame.queryId === queryId);
  }

  /**
   * Wait for the reply frame (the first frame that is not a keepalive).
   *
   * @param {string} queryId - From `call`
   * @param {number} [ms=3000] - Give up after this long
   * @returns {Promise<Object>} The reply frame
   */
  async function reply(queryId, ms = 3000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const hit = framesFor(queryId).find((frame) => !frame._keepalive);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`no reply for ${queryId} within ${ms} ms`);
  }

  return { frames, call, framesFor, reply, close: () => ws.close() };
}

module.exports = { connectRaw };
