const roundTrip = require('./roundTrip');

/**
 * Test Date round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {Date} [options.date] - Date to test (default: now)
 * @returns {Promise<{sent: Date, received: Date, matches: boolean}>}
 *
 * @example
 * await testDate({ client, endpoint: 'echo', date: new Date('2024-01-01') })
 */
async function testDate({ client, endpoint, date }) {
  const testDate = date || new Date();
  const { received, matches } = await roundTrip({
    client,
    endpoint,
    data: { date: testDate },
  });

  // Verify it's actually a Date object
  if (!(received.date instanceof Date)) {
    throw new Error(
      `testDate: expected Date instance but got ${typeof received.date}`
    );
  }

  // Verify timestamp matches
  if (received.date.getTime() !== testDate.getTime()) {
    throw new Error(
      `testDate: timestamp mismatch (sent: ${testDate.getTime()}, received: ${received.date.getTime()})`
    );
  }

  return { sent: testDate, received: received.date, matches: true };
}

module.exports = testDate;
