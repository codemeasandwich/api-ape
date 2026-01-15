/**
 * Verify embed values are accessible in a controller
 *
 * Calls an endpoint that returns `this.*` values and checks they match embed.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Connected client
 * @param {string} options.endpoint - Endpoint that returns embed values (e.g., 'profile')
 * @param {string} options.embedKey - Key to check in response
 * @param {any} [options.expectedValue] - Expected value (if provided, asserts match)
 * @returns {Promise<any>} The embed value from the controller
 *
 * @example
 * const userId = await verifyEmbed({
 *   client,
 *   endpoint: 'profile',
 *   embedKey: 'userId',
 *   expectedValue: '123'
 * })
 */
async function verifyEmbed({ client, endpoint, embedKey, expectedValue }) {
  if (!client) {
    throw new Error('verifyEmbed: client required');
  }
  if (!endpoint) {
    throw new Error('verifyEmbed: endpoint required');
  }
  if (!embedKey) {
    throw new Error('verifyEmbed: embedKey required');
  }

  const result = await client.call(endpoint, {});

  const actualValue = result?.[embedKey];

  if (expectedValue !== undefined) {
    const actualStr = JSON.stringify(actualValue);
    const expectedStr = JSON.stringify(expectedValue);
    if (actualStr !== expectedStr) {
      throw new Error(
        `verifyEmbed: expected ${embedKey}=${expectedStr} but got ${embedKey}=${actualStr}`
      );
    }
  }

  return actualValue;
}

module.exports = verifyEmbed;
