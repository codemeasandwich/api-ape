/**
 * @fileoverview Phase 1 resume mismatch — forged session must mint a new clientId.
 *
 * Resume hint without matching `sessionId` must mint a new `clientId` — bearer
 * defense-in-depth for URL-carried resume tokens (Phase 1).
 *
 * @param {{ harness: import('../../../harness').Harness, expect: jest.Expect }} ctx - Test context
 * @returns {Promise<void>}
 */
module.exports = async function reconnectWithMismatchedSessionMintsNewClientId({
  harness,
  expect,
}) {
  const server = await harness.createServer({ where: "test-api" });
  const client = await harness.createClientForServer(server);
  const firstId = client.serverClientId;
  expect(firstId).toBeTruthy();

  await client.disconnect();
  await harness.wait(50);

  client._cookies.sessionId = "wrong-session-for-resume-test";

  await client.connect();
  expect(client.connected).toBe(true);
  expect(client.serverClientId).not.toBe(firstId);
};
