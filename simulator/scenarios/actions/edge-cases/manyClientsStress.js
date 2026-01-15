/**
 * Stress test with many simultaneous clients
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to stress
 * @param {number} options.clientCount - Number of clients
 * @param {string} options.endpoint - Endpoint for test calls
 * @returns {Promise<{connected: number, callSuccess: number, callFailed: number}>}
 */
async function manyClientsStress({ harness, server, clientCount, endpoint }) {
  if (!harness) {
    throw new Error('manyClientsStress: harness required');
  }
  if (!server) {
    throw new Error('manyClientsStress: server required');
  }
  if (!clientCount) {
    throw new Error('manyClientsStress: clientCount required');
  }

  // Connect all clients
  const clients = [];
  for (let i = 0; i < clientCount; i++) {
    const client = await harness.createClientForServer(server);
    clients.push(client);
  }

  // Make simultaneous calls
  const callPromises = clients.map((client, i) =>
    client.call(endpoint, { index: i }, { timeout: 5000 })
      .then((r) => ({ success: true, result: r }))
      .catch((e) => ({ success: false, error: e }))
  );

  const results = await Promise.all(callPromises);

  let callSuccess = 0;
  let callFailed = 0;
  for (const r of results) {
    if (r.success) callSuccess++;
    else callFailed++;
  }

  // Cleanup
  for (const client of clients) {
    await client.disconnect();
  }

  return {
    connected: clients.length,
    callSuccess,
    callFailed,
  };
}

module.exports = manyClientsStress;
