/**
 * @fileoverview Edge Case Actions - Atomic operations for testing edge cases
 *
 * These actions test api-ape's handling of edge cases through the public interface:
 * - Timeouts: Request timeout handling
 * - Large payloads: Memory and performance limits
 * - Errors: Controller errors, network errors, invalid data
 * - Concurrent requests: Race conditions, request ordering
 * - Reconnection: Mid-request disconnects
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/edge-cases
 *
 * @example
 * const { edge } = require('../actions')
 *
 * // Test request timeout
 * await edge.timeout({ client, endpoint: 'delay', timeout: 50 })
 *
 * // Test large payload handling
 * await edge.largePayload({ client, endpoint: 'echo', sizeKB: 500 })
 *
 * // Test rapid concurrent requests
 * await edge.rapidRequests({ client, endpoint: 'echo', count: 100 })
 */

/**
 * Test request timeout handling
 *
 * Sends a request that should exceed the timeout, verifying
 * the client properly handles timeout errors.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that delays (e.g., 'delay')
 * @param {any} [options.data] - Data to send
 * @param {number} options.timeout - Short timeout that should be exceeded (ms)
 * @returns {Promise<{timedOut: boolean, error: Error}>}
 *
 * @example
 * const result = await edge.timeout({
 *   client,
 *   endpoint: 'delay',
 *   data: { ms: 500 },
 *   timeout: 50
 * })
 * expect(result.timedOut).toBe(true)
 */
async function timeout({ client, endpoint, data, timeout: timeoutMs }) {
  if (!client) {
    throw new Error('timeout: client required');
  }
  if (!endpoint) {
    throw new Error('timeout: endpoint required');
  }
  if (!timeoutMs) {
    throw new Error('timeout: timeout value required');
  }

  let timedOut = false;
  let error = null;

  try {
    await client.call(endpoint, data, { timeout: timeoutMs });
  } catch (err) {
    error = err;
    const errorMsg = (err.message || String(err)).toLowerCase();
    timedOut = errorMsg.includes('timeout') || errorMsg.includes('timed out');
  }

  return { timedOut, error };
}

/**
 * Test large payload handling
 *
 * Sends a large payload to test memory handling and WebSocket frame limits.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint (e.g., 'echo')
 * @param {number} options.sizeKB - Payload size in kilobytes
 * @param {number} [options.timeout=30000] - Timeout (larger for big payloads)
 * @returns {Promise<{success: boolean, sentSize: number, receivedSize: number}>}
 *
 * @example
 * const result = await edge.largePayload({
 *   client,
 *   endpoint: 'echo',
 *   sizeKB: 1024 // 1MB
 * })
 */
async function largePayload({ client, endpoint, sizeKB, timeout = 30000 }) {
  if (!client) {
    throw new Error('largePayload: client required');
  }
  if (!endpoint) {
    throw new Error('largePayload: endpoint required');
  }
  if (!sizeKB || sizeKB < 1) {
    throw new Error('largePayload: sizeKB must be >= 1');
  }

  // Generate large string payload
  const sizeBytes = sizeKB * 1024;
  const chunk = 'x'.repeat(1024); // 1KB chunk
  let payload = '';
  for (let i = 0; i < sizeKB; i++) {
    payload += chunk;
  }

  const data = { payload, size: sizeBytes };

  try {
    const result = await client.call(endpoint, data, { timeout });

    const receivedSize = result?.payload?.length || 0;

    return {
      success: true,
      sentSize: sizeBytes,
      receivedSize,
      matches: receivedSize === sizeBytes,
    };
  } catch (err) {
    return {
      success: false,
      sentSize: sizeBytes,
      receivedSize: 0,
      error: err,
    };
  }
}

/**
 * Test large payload with binary data
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint for binary handling
 * @param {number} options.sizeKB - Size in kilobytes
 * @param {number} [options.timeout=30000] - Timeout
 * @returns {Promise<{success: boolean, sentSize: number}>}
 */
async function largeBinaryPayload({ client, endpoint, sizeKB, timeout = 30000 }) {
  if (!client) {
    throw new Error('largeBinaryPayload: client required');
  }

  const sizeBytes = sizeKB * 1024;
  const buffer = Buffer.alloc(sizeBytes);

  // Fill with pattern for verification
  for (let i = 0; i < sizeBytes; i++) {
    buffer[i] = i % 256;
  }

  try {
    const result = await client.call(endpoint, { data: buffer }, { timeout });

    return {
      success: true,
      sentSize: sizeBytes,
      result,
    };
  } catch (err) {
    return {
      success: false,
      sentSize: sizeBytes,
      error: err,
    };
  }
}

/**
 * Test rapid sequential requests
 *
 * Sends many requests in rapid succession to test request handling.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} options.count - Number of requests
 * @param {any} [options.data] - Data to send each time
 * @param {number} [options.timeout=5000] - Timeout per request
 * @returns {Promise<{total: number, succeeded: number, failed: number, duration: number}>}
 *
 * @example
 * const result = await edge.rapidRequests({
 *   client,
 *   endpoint: 'echo',
 *   count: 100
 * })
 * expect(result.succeeded).toBe(100)
 */
async function rapidRequests({ client, endpoint, count, data, timeout = 5000 }) {
  if (!client) {
    throw new Error('rapidRequests: client required');
  }
  if (!endpoint) {
    throw new Error('rapidRequests: endpoint required');
  }
  if (!count || count < 1) {
    throw new Error('rapidRequests: count must be >= 1');
  }

  const start = Date.now();
  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < count; i++) {
    try {
      await client.call(endpoint, data || { index: i }, { timeout });
      succeeded++;
    } catch (err) {
      failed++;
      if (errors.length < 5) {
        errors.push(err.message || String(err));
      }
    }
  }

  const duration = Date.now() - start;

  return {
    total: count,
    succeeded,
    failed,
    duration,
    requestsPerSecond: (count / duration) * 1000,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Test concurrent requests (all at once)
 *
 * Sends many requests concurrently to test parallel handling.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} options.count - Number of concurrent requests
 * @param {Function} [options.dataGenerator] - Function (index) => data
 * @param {number} [options.timeout=5000] - Timeout per request
 * @returns {Promise<{total: number, succeeded: number, failed: number, results: any[]}>}
 *
 * @example
 * const result = await edge.concurrentRequests({
 *   client,
 *   endpoint: 'echo',
 *   count: 50,
 *   dataGenerator: (i) => ({ id: i })
 * })
 */
async function concurrentRequests({ client, endpoint, count, dataGenerator, timeout = 5000 }) {
  if (!client) {
    throw new Error('concurrentRequests: client required');
  }
  if (!endpoint) {
    throw new Error('concurrentRequests: endpoint required');
  }
  if (!count || count < 1) {
    throw new Error('concurrentRequests: count must be >= 1');
  }

  const gen = dataGenerator || ((i) => ({ index: i }));

  const promises = [];
  for (let i = 0; i < count; i++) {
    const data = gen(i);
    promises.push(
      client
        .call(endpoint, data, { timeout })
        .then((result) => ({ success: true, result, index: i }))
        .catch((error) => ({ success: false, error: error.message || String(error), index: i }))
    );
  }

  const results = await Promise.all(promises);

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    total: count,
    succeeded,
    failed,
    results,
  };
}

/**
 * Test that responses match their requests (no cross-talk)
 *
 * Sends concurrent requests with unique identifiers and verifies
 * each response matches its request.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {number} options.count - Number of concurrent requests
 * @param {number} [options.timeout=5000] - Timeout
 * @returns {Promise<{matches: number, mismatches: number, details: Object[]}>}
 *
 * @example
 * const result = await edge.verifyConcurrentIsolation({
 *   client,
 *   endpoint: 'echo',
 *   count: 20
 * })
 * expect(result.mismatches).toBe(0)
 */
async function verifyConcurrentIsolation({ client, endpoint, count, timeout = 5000 }) {
  const results = await concurrentRequests({
    client,
    endpoint,
    count,
    dataGenerator: (i) => ({ uniqueId: `req-${i}-${Date.now()}`, index: i }),
    timeout,
  });

  let matches = 0;
  let mismatches = 0;
  const details = [];

  for (const r of results.results) {
    if (r.success) {
      const sentIndex = r.index;
      const receivedIndex = r.result?.index;
      const uniqueIdMatch = r.result?.uniqueId?.includes(`req-${sentIndex}-`);

      if (receivedIndex === sentIndex && uniqueIdMatch) {
        matches++;
      } else {
        mismatches++;
        details.push({
          sent: sentIndex,
          received: receivedIndex,
          uniqueIdMatch,
        });
      }
    } else {
      mismatches++;
      details.push({ sent: r.index, error: r.error });
    }
  }

  return { matches, mismatches, details: details.length > 0 ? details : undefined };
}

/**
 * Test controller error handling
 *
 * Calls an endpoint that should throw an error and verifies
 * the error is properly propagated to the client.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that throws errors
 * @param {any} [options.data] - Data to trigger error
 * @param {string} [options.expectedError] - Expected error substring
 * @returns {Promise<{errored: boolean, errorMessage: string}>}
 *
 * @example
 * const result = await edge.controllerError({
 *   client,
 *   endpoint: 'errors',
 *   data: { type: 'throw' },
 *   expectedError: 'intentional'
 * })
 */
async function controllerError({ client, endpoint, data, expectedError }) {
  if (!client) {
    throw new Error('controllerError: client required');
  }
  if (!endpoint) {
    throw new Error('controllerError: endpoint required');
  }

  let errored = false;
  let errorMessage = null;

  try {
    await client.call(endpoint, data);
  } catch (err) {
    errored = true;
    errorMessage = err.message || String(err);
  }

  if (expectedError && errorMessage && !errorMessage.includes(expectedError)) {
    throw new Error(
      `controllerError: expected error containing '${expectedError}' but got '${errorMessage}'`
    );
  }

  return { errored, errorMessage };
}

/**
 * Test unknown endpoint handling
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} [options.endpoint='nonexistent-endpoint-xyz'] - Non-existent endpoint
 * @returns {Promise<{errored: boolean, errorMessage: string}>}
 *
 * @example
 * const result = await edge.unknownEndpoint({ client })
 * expect(result.errored).toBe(true)
 */
async function unknownEndpoint({ client, endpoint = 'nonexistent-endpoint-xyz' }) {
  return controllerError({
    client,
    endpoint,
    expectedError: 'not found',
  });
}

/**
 * Test invalid data handling
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {string} options.invalidType - Type of invalid data: 'circular', 'huge', 'symbol'
 * @returns {Promise<{handled: boolean, result?: any, error?: string}>}
 */
async function invalidData({ client, endpoint, invalidType }) {
  if (!client) {
    throw new Error('invalidData: client required');
  }

  let data;

  switch (invalidType) {
    case 'circular':
      data = { a: 1 };
      data.self = data; // JSS should handle circular refs
      break;

    case 'huge':
      // Create deeply nested structure
      data = {};
      let current = data;
      for (let i = 0; i < 100; i++) {
        current.nested = { level: i };
        current = current.nested;
      }
      break;

    case 'empty':
      data = null;
      break;

    case 'undefined':
      data = undefined;
      break;

    default:
      data = { test: true };
  }

  try {
    const result = await client.call(endpoint, data);
    return { handled: true, result };
  } catch (err) {
    return { handled: true, error: err.message || String(err) };
  }
}

/**
 * Test request during disconnect
 *
 * Starts a request and disconnects mid-flight.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint (preferably slow)
 * @param {number} [options.disconnectAfterMs=10] - Time before disconnect
 * @returns {Promise<{completed: boolean, error?: string}>}
 */
async function requestDuringDisconnect({ client, endpoint, disconnectAfterMs = 10 }) {
  if (!client) {
    throw new Error('requestDuringDisconnect: client required');
  }

  let completed = false;
  let error = null;

  // Start request
  const requestPromise = client.call(endpoint, { test: true }).then(
    () => {
      completed = true;
    },
    (err) => {
      error = err.message || String(err);
    }
  );

  // Disconnect after delay
  await new Promise((r) => setTimeout(r, disconnectAfterMs));
  try {
    await client.disconnect();
  } catch (e) {
    // May already be in progress
  }

  // Wait for request to settle
  await requestPromise.catch(() => {});

  return { completed, error };
}

/**
 * Test multiple clients making same request simultaneously
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Array of clients
 * @param {string} options.endpoint - Endpoint to call
 * @param {any} options.data - Data to send
 * @param {number} [options.timeout=5000] - Timeout
 * @returns {Promise<{results: Array, allSucceeded: boolean}>}
 */
async function multiClientSameRequest({ clients, endpoint, data, timeout = 5000 }) {
  if (!Array.isArray(clients) || clients.length === 0) {
    throw new Error('multiClientSameRequest: clients array required');
  }

  const promises = clients.map((client, index) =>
    client
      .call(endpoint, data, { timeout })
      .then((result) => ({ clientIndex: index, success: true, result }))
      .catch((error) => ({ clientIndex: index, success: false, error: error.message }))
  );

  const results = await Promise.all(promises);
  const allSucceeded = results.every((r) => r.success);

  return { results, allSucceeded };
}

/**
 * Test empty/null response from controller
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that returns nothing
 * @returns {Promise<{result: any, isUndefined: boolean, isNull: boolean}>}
 */
async function emptyResponse({ client, endpoint }) {
  if (!client) {
    throw new Error('emptyResponse: client required');
  }

  const result = await client.call(endpoint, { returnEmpty: true });

  return {
    result,
    isUndefined: result === undefined,
    isNull: result === null,
  };
}

/**
 * Assert that an operation times out
 *
 * @param {Object} options - Options
 * @param {Function} options.operation - Async function that should timeout
 * @param {number} options.timeout - Expected timeout
 */
async function assertTimeout({ operation, timeout }) {
  const start = Date.now();
  let timedOut = false;

  try {
    await Promise.race([
      operation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout)
      ),
    ]);
  } catch (err) {
    if (err.message === 'timeout' || Date.now() - start >= timeout - 10) {
      timedOut = true;
    }
  }

  if (!timedOut) {
    throw new Error(`assertTimeout: expected timeout after ${timeout}ms`);
  }
}

/**
 * Assert operation completes within time limit
 *
 * @param {Object} options - Options
 * @param {Function} options.operation - Async function
 * @param {number} options.maxMs - Maximum milliseconds allowed
 * @returns {Promise<{result: any, duration: number}>}
 */
async function assertFast({ operation, maxMs }) {
  const start = Date.now();
  const result = await operation();
  const duration = Date.now() - start;

  if (duration > maxMs) {
    throw new Error(
      `assertFast: expected completion within ${maxMs}ms but took ${duration}ms`
    );
  }

  return { result, duration };
}

module.exports = {
  // Timeout testing
  timeout,
  assertTimeout,

  // Large payload testing
  largePayload,
  largeBinaryPayload,

  // Concurrent/rapid requests
  rapidRequests,
  concurrentRequests,
  verifyConcurrentIsolation,
  multiClientSameRequest,

  // Error handling
  controllerError,
  unknownEndpoint,
  invalidData,

  // Connection edge cases
  requestDuringDisconnect,
  emptyResponse,

  // Performance assertions
  assertFast,
};
