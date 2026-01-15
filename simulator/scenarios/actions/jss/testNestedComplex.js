const roundTrip = require('./roundTrip');

/**
 * Test complex nested structure with mixed types
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @returns {Promise<{matches: boolean, sent: any, received: any}>}
 */
async function testNestedComplex({ client, endpoint }) {
  const testData = {
    users: [
      {
        id: 1,
        createdAt: new Date('2024-01-01'),
        tags: new Set(['admin', 'active']),
        metadata: new Map([['lastLogin', new Date()], ['loginCount', 42]]),
      },
      {
        id: 2,
        createdAt: new Date('2024-02-15'),
        tags: new Set(['user']),
        metadata: new Map([['preferences', { theme: 'dark' }]]),
      },
    ],
    config: {
      patterns: [/include-.*/, /exclude-.*/i],
      lastUpdated: new Date(),
    },
  };

  const { received, matches } = await roundTrip({ client, endpoint, data: testData });

  // Additional verification
  if (!Array.isArray(received.users) || received.users.length !== 2) {
    throw new Error('testNestedComplex: users array structure invalid');
  }

  if (!(received.users[0].createdAt instanceof Date)) {
    throw new Error('testNestedComplex: nested Date not preserved');
  }

  if (!(received.users[0].tags instanceof Set)) {
    throw new Error('testNestedComplex: nested Set not preserved');
  }

  if (!(received.users[0].metadata instanceof Map)) {
    throw new Error('testNestedComplex: nested Map not preserved');
  }

  return { matches: true, sent: testData, received };
}

module.exports = testNestedComplex;
