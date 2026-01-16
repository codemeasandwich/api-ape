/**
 * Connect a client and verify it receives a welcome message
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @param {string} options.welcomeType - Expected welcome message type
 * @param {number} [options.timeout=200] - Timeout for welcome (ms)
 * @returns {Promise<{client: Object, welcome: Object}>} Client and welcome message
 *
 * @example
 * const { client, welcome } = await connectAndExpectWelcome({
 *   server,
 *   welcomeType: 'welcome'
 * })
 */
async function connectAndExpectWelcome({ server, welcomeType, timeout = 200 }) {
  if (!server) {
    throw new Error('connectAndExpectWelcome: server required');
  }

  const harness = server._harness;
  if (!harness) {
    throw new Error('connectAndExpectWelcome: server missing harness reference');
  }

  const client = await harness.createClientForServer(server);

  // Wait for welcome message
  const welcome = await client.waitFor(welcomeType, timeout);

  return { client, welcome };
}

module.exports = connectAndExpectWelcome;
