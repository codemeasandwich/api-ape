/**
 * Create a server with custom onConnect handler that sets embed values
 *
 * The embed values will be available as `this.*` in all controllers.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object|Function} options.embed - Embed object or function(socket, req) => embed
 * @param {string} [options.where='controllers'] - Controller directory
 * @param {Function} [options.onReceive] - Optional onReceive hook
 * @param {Function} [options.onSend] - Optional onSend hook
 * @param {Function} [options.onError] - Optional onError hook
 * @param {Function} [options.onDisconnect] - Optional onDisconnect hook
 * @returns {Promise<{server: Object, events: Object}>} Server and event tracker
 *
 * @example
 * const { server, events } = await createServerWithEmbed({
 *   harness,
 *   embed: { userId: 'user-123', role: 'admin' }
 * })
 */
async function createServerWithEmbed({
  harness,
  embed,
  where = 'controllers',
  onReceive,
  onSend,
  onError,
  onDisconnect,
}) {
  if (!harness) {
    throw new Error('createServerWithEmbed: harness required');
  }

  // Event tracker to record lifecycle events
  const events = {
    connections: [],
    disconnections: [],
    receives: [],
    sends: [],
    errors: [],
  };

  // Build onConnect handler
  const onConnectHandler = (socket, req, send) => {
    const connectionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // Resolve embed value
    const embedValue = typeof embed === 'function' ? embed(socket, req, send) : embed;

    // Track connection
    events.connections.push({
      connectionId,
      timestamp: Date.now(),
      headers: req.headers,
    });

    return {
      embed: embedValue || {},

      onReceive: (queryId, data, type) => {
        events.receives.push({ connectionId, queryId, data, type, timestamp: Date.now() });
        if (onReceive) {
          return onReceive(queryId, data, type);
        }
      },

      onSend: (data, type) => {
        events.sends.push({ connectionId, data, type, timestamp: Date.now() });
        if (onSend) {
          return onSend(data, type);
        }
      },

      onError: (errStr) => {
        events.errors.push({ connectionId, error: errStr, timestamp: Date.now() });
        if (onError) {
          onError(errStr);
        }
      },

      onDisconnect: () => {
        events.disconnections.push({ connectionId, timestamp: Date.now() });
        if (onDisconnect) {
          onDisconnect();
        }
      },
    };
  };

  const server = await harness.createServer({
    where,
    onConnect: onConnectHandler,
  });

  // Store harness reference for later use
  server._harness = harness;

  return { server, events };
}

module.exports = createServerWithEmbed;
