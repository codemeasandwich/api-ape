/**
 * Create a server that sends a welcome message on connect
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {string} options.welcomeType - Message type for welcome
 * @param {any} options.welcomeData - Data to send in welcome message
 * @param {Object} [options.embed] - Optional embed values
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<{server: Object, events: Object}>}
 *
 * @example
 * const { server } = await createServerWithWelcome({
 *   harness,
 *   welcomeType: 'welcome',
 *   welcomeData: { message: 'Hello!' }
 * })
 */
async function createServerWithWelcome({
  harness,
  welcomeType,
  welcomeData,
  embed,
  where = 'controllers',
}) {
  if (!harness) {
    throw new Error('createServerWithWelcome: harness required');
  }
  if (!welcomeType) {
    throw new Error('createServerWithWelcome: welcomeType required');
  }

  const events = {
    connections: [],
    disconnections: [],
    welcomesSent: [],
  };

  const onConnectHandler = (socket, req, send) => {
    const connectionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    events.connections.push({ connectionId, timestamp: Date.now() });

    // Send welcome message
    send(welcomeType, welcomeData);
    events.welcomesSent.push({ connectionId, type: welcomeType, data: welcomeData, timestamp: Date.now() });

    const embedValue = typeof embed === 'function' ? embed(socket, req, send) : embed;

    return {
      embed: embedValue || {},
      onDisconnect: () => {
        events.disconnections.push({ connectionId, timestamp: Date.now() });
      },
    };
  };

  const server = await harness.createServer({
    where,
    onConnect: onConnectHandler,
  });

  server._harness = harness;

  return { server, events };
}

module.exports = createServerWithWelcome;
