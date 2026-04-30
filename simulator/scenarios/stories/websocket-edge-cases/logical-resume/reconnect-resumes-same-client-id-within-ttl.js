/**
 * @fileoverview Phase 1 resume TTL happy path — same logical clientId when pairing matches.
 *
 * WebSocket reconnect within TTL reuses the same logical `clientId` when the
 * `(sessionId, clientId)` pairing matches (Phase 1 resume via `?resume=`).
 *
 * @param {{ harness: import('../../../harness').Harness, expect: jest.Expect }} ctx - Test context
 * @returns {Promise<void>}
 */
module.exports = async function reconnectResumesSameClientIdWithinTtl({
  harness,
  expect,
}) {
  const server = await harness.createServer({ where: "test-api" });
  const client = await harness.createClientForServer(server);
  const firstId = client.serverClientId;
  expect(firstId).toBeTruthy();
  expect(client._cookies.sessionId).toBeTruthy();

  await client.disconnect();
  await harness.wait(50);

  await client.connect();
  expect(client.connected).toBe(true);
  expect(client.serverClientId).toBe(firstId);
};
