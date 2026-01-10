/**
 * @fileoverview RPC Actions - Atomic operations for remote procedure calls
 *
 * These actions handle RPC calls through api-ape's public interface.
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/rpc
 *
 * @example
 * const { rpc } = require('../actions')
 *
 * const result = await rpc.call({ client, endpoint: 'echo', data: { msg: 'hi' } })
 * await rpc.expectError({ client, endpoint: 'unknown', errorContains: 'not found' })
 */

/**
 * Call an API endpoint and return the result
 *
 * @param {Object} options - Call options
 * @param {Object} options.client - Client instance to use
 * @param {string} options.endpoint - Endpoint path (e.g., 'echo', 'users/profile')
 * @param {any} [options.data] - Data to send to the endpoint
 * @param {number} [options.timeout=1000] - Request timeout in ms
 * @returns {Promise<any>} Response from the endpoint
 *
 * @example
 * const result = await rpc.call({
 *   client,
 *   endpoint: 'echo',
 *   data: { message: 'Hello!' }
 * })
 * expect(result.message).toBe('Hello!')
 */
async function call({ client, endpoint, data, timeout = 1000 }) {
  if (!client) {
    throw new Error('call: client required');
  }
  if (!endpoint) {
    throw new Error('call: endpoint required');
  }

  const result = await client.call(endpoint, data, { timeout });
  return result;
}

/**
 * Call a nested route endpoint
 *
 * Convenience wrapper for calling nested routes like 'users/profile'.
 *
 * @param {Object} options - Call options
 * @param {Object} options.client - Client instance
 * @param {string[]} options.path - Path segments (e.g., ['users', 'profile'])
 * @param {any} [options.data] - Data to send
 * @param {number} [options.timeout=1000] - Timeout in ms
 * @returns {Promise<any>} Response from the endpoint
 *
 * @example
 * const profile = await rpc.callNested({
 *   client,
 *   path: ['users', 'profile'],
 *   data: { id: 123 }
 * })
 */
async function callNested({ client, path, data, timeout = 1000 }) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('callNested: path array required');
  }

  const endpoint = path.join('/');
  return call({ client, endpoint, data, timeout });
}

/**
 * Call an endpoint and expect a specific result
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data] - Data to send
 * @param {any} options.expected - Expected result (deep equality)
 * @param {number} [options.timeout=1000] - Timeout in ms
 * @returns {Promise<any>} The actual result
 *
 * @example
 * await rpc.callExpect({
 *   client,
 *   endpoint: 'echo',
 *   data: { x: 1 },
 *   expected: { x: 1 }
 * })
 */
async function callExpect({ client, endpoint, data, expected, timeout = 1000 }) {
  const result = await call({ client, endpoint, data, timeout });

  const actualStr = JSON.stringify(result);
  const expectedStr = JSON.stringify(expected);

  if (actualStr !== expectedStr) {
    throw new Error(
      `callExpect: expected ${expectedStr} but got ${actualStr}`
    );
  }

  return result;
}

/**
 * Call an endpoint and expect it to throw an error
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data] - Data to send
 * @param {string} [options.errorContains] - Substring the error should contain
 * @param {string} [options.errorEquals] - Exact error message expected
 * @param {number} [options.timeout=1000] - Timeout in ms
 * @returns {Promise<Error>} The caught error
 *
 * @example
 * const err = await rpc.expectError({
 *   client,
 *   endpoint: 'unknown-endpoint',
 *   errorContains: 'not found'
 * })
 */
async function expectError({ client, endpoint, data, errorContains, errorEquals, timeout = 1000 }) {
  if (!client) {
    throw new Error('expectError: client required');
  }
  if (!endpoint) {
    throw new Error('expectError: endpoint required');
  }

  let caught = null;

  try {
    await call({ client, endpoint, data, timeout });
  } catch (err) {
    caught = err;
  }

  if (!caught) {
    throw new Error(`expectError: expected error for endpoint '${endpoint}' but call succeeded`);
  }

  const errorMessage = caught.message || String(caught);

  if (errorContains && !errorMessage.includes(errorContains)) {
    throw new Error(
      `expectError: expected error containing '${errorContains}' but got '${errorMessage}'`
    );
  }

  if (errorEquals && errorMessage !== errorEquals) {
    throw new Error(
      `expectError: expected error '${errorEquals}' but got '${errorMessage}'`
    );
  }

  return caught;
}

/**
 * Make multiple concurrent calls and collect results
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {Array<{endpoint: string, data?: any}>} options.calls - Array of calls to make
 * @param {number} [options.timeout=1000] - Timeout for each call
 * @returns {Promise<Array<{result?: any, error?: Error}>>} Array of results/errors
 *
 * @example
 * const results = await rpc.callMany({
 *   client,
 *   calls: [
 *     { endpoint: 'echo', data: { n: 1 } },
 *     { endpoint: 'echo', data: { n: 2 } },
 *     { endpoint: 'echo', data: { n: 3 } }
 *   ]
 * })
 */
async function callMany({ client, calls, timeout = 1000 }) {
  if (!client) {
    throw new Error('callMany: client required');
  }
  if (!Array.isArray(calls)) {
    throw new Error('callMany: calls array required');
  }

  const promises = calls.map(async ({ endpoint, data }) => {
    try {
      const result = await call({ client, endpoint, data, timeout });
      return { result };
    } catch (error) {
      return { error };
    }
  });

  return Promise.all(promises);
}

/**
 * Make concurrent calls and expect all to succeed
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {Array<{endpoint: string, data?: any}>} options.calls - Array of calls
 * @param {number} [options.timeout=1000] - Timeout for each call
 * @returns {Promise<any[]>} Array of results
 *
 * @example
 * const [r1, r2, r3] = await rpc.callManyExpectSuccess({
 *   client,
 *   calls: [
 *     { endpoint: 'echo', data: { n: 1 } },
 *     { endpoint: 'echo', data: { n: 2 } },
 *     { endpoint: 'echo', data: { n: 3 } }
 *   ]
 * })
 */
async function callManyExpectSuccess({ client, calls, timeout = 1000 }) {
  const results = await callMany({ client, calls, timeout });

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    const errorMessages = errors.map((r) => r.error.message || String(r.error));
    throw new Error(
      `callManyExpectSuccess: ${errors.length} calls failed: ${errorMessages.join(', ')}`
    );
  }

  return results.map((r) => r.result);
}

/**
 * Call with a specific timeout and expect timeout error
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that should take longer than timeout
 * @param {any} [options.data] - Data to send
 * @param {number} options.timeout - Short timeout that should be exceeded
 * @returns {Promise<Error>} The timeout error
 *
 * @example
 * const err = await rpc.expectTimeout({
 *   client,
 *   endpoint: 'delay',
 *   data: { ms: 500 },
 *   timeout: 50
 * })
 */
async function expectTimeout({ client, endpoint, data, timeout }) {
  if (!timeout) {
    throw new Error('expectTimeout: timeout required');
  }

  let caught = null;

  try {
    await call({ client, endpoint, data, timeout });
  } catch (err) {
    caught = err;
  }

  if (!caught) {
    throw new Error(`expectTimeout: expected timeout for endpoint '${endpoint}' but call succeeded`);
  }

  // Check if it's a timeout-related error
  const errorMessage = (caught.message || String(caught)).toLowerCase();
  if (!errorMessage.includes('timeout') && !errorMessage.includes('timed out')) {
    throw new Error(
      `expectTimeout: expected timeout error but got '${caught.message || caught}'`
    );
  }

  return caught;
}

/**
 * Call an endpoint multiple times sequentially
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {any} [options.data] - Data to send each time
 * @param {number} options.count - Number of times to call
 * @param {number} [options.timeout=1000] - Timeout per call
 * @returns {Promise<any[]>} Array of results
 *
 * @example
 * const results = await rpc.callSequential({
 *   client,
 *   endpoint: 'counter',
 *   count: 5
 * })
 */
async function callSequential({ client, endpoint, data, count, timeout = 1000 }) {
  if (!count || count < 1) {
    throw new Error('callSequential: count must be >= 1');
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await call({ client, endpoint, data, timeout });
    results.push(result);
  }
  return results;
}

/**
 * Call an endpoint with generated data for each iteration
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {Function} options.dataGenerator - Function (index) => data
 * @param {number} options.count - Number of calls
 * @param {boolean} [options.concurrent=false] - Run concurrently or sequentially
 * @param {number} [options.timeout=1000] - Timeout per call
 * @returns {Promise<any[]>} Array of results
 *
 * @example
 * const results = await rpc.callWithGenerator({
 *   client,
 *   endpoint: 'echo',
 *   dataGenerator: (i) => ({ index: i, value: i * 10 }),
 *   count: 5,
 *   concurrent: true
 * })
 */
async function callWithGenerator({ client, endpoint, dataGenerator, count, concurrent = false, timeout = 1000 }) {
  if (typeof dataGenerator !== 'function') {
    throw new Error('callWithGenerator: dataGenerator function required');
  }
  if (!count || count < 1) {
    throw new Error('callWithGenerator: count must be >= 1');
  }

  const calls = [];
  for (let i = 0; i < count; i++) {
    calls.push({ endpoint, data: dataGenerator(i) });
  }

  if (concurrent) {
    return callManyExpectSuccess({ client, calls, timeout });
  }

  const results = [];
  for (const c of calls) {
    const result = await call({ client, endpoint: c.endpoint, data: c.data, timeout });
    results.push(result);
  }
  return results;
}

/**
 * Assert that a result has expected properties
 *
 * @param {Object} options - Options
 * @param {any} options.result - Result to check
 * @param {Object} options.properties - Expected properties (partial match)
 * @returns {void}
 *
 * @example
 * const result = await rpc.call({ client, endpoint: 'user', data: { id: 1 } })
 * rpc.assertProperties({ result, properties: { id: 1, active: true } })
 */
function assertProperties({ result, properties }) {
  if (!result || typeof result !== 'object') {
    throw new Error(`assertProperties: result must be an object, got ${typeof result}`);
  }

  for (const [key, expectedValue] of Object.entries(properties)) {
    const actualValue = result[key];
    const actualStr = JSON.stringify(actualValue);
    const expectedStr = JSON.stringify(expectedValue);

    if (actualStr !== expectedStr) {
      throw new Error(
        `assertProperties: expected ${key}=${expectedStr} but got ${key}=${actualStr}`
      );
    }
  }
}

/**
 * Assert that a result contains expected keys
 *
 * @param {Object} options - Options
 * @param {any} options.result - Result to check
 * @param {string[]} options.keys - Keys that must be present
 * @returns {void}
 *
 * @example
 * const result = await rpc.call({ client, endpoint: 'status' })
 * rpc.assertHasKeys({ result, keys: ['online', 'timestamp', 'version'] })
 */
function assertHasKeys({ result, keys }) {
  if (!result || typeof result !== 'object') {
    throw new Error(`assertHasKeys: result must be an object, got ${typeof result}`);
  }

  const missing = keys.filter((key) => !(key in result));
  if (missing.length > 0) {
    throw new Error(`assertHasKeys: missing keys: ${missing.join(', ')}`);
  }
}

/**
 * Assert that a result is a specific type
 *
 * @param {Object} options - Options
 * @param {any} options.result - Result to check
 * @param {string} options.type - Expected type: 'object', 'array', 'string', 'number', 'boolean'
 * @returns {void}
 *
 * @example
 * const result = await rpc.call({ client, endpoint: 'list' })
 * rpc.assertType({ result, type: 'array' })
 */
function assertType({ result, type }) {
  let actual;

  if (type === 'array') {
    if (!Array.isArray(result)) {
      throw new Error(`assertType: expected array but got ${typeof result}`);
    }
    return;
  }

  actual = typeof result;
  if (actual !== type) {
    throw new Error(`assertType: expected ${type} but got ${actual}`);
  }
}

/**
 * Call from multiple clients and collect all results
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Array of client instances
 * @param {string} options.endpoint - Endpoint to call
 * @param {any} [options.data] - Data to send
 * @param {boolean} [options.concurrent=true] - Run concurrently
 * @param {number} [options.timeout=1000] - Timeout per call
 * @returns {Promise<Array<{client: Object, result?: any, error?: Error}>>}
 *
 * @example
 * const results = await rpc.callFromAll({
 *   clients: [alice, bob, charlie],
 *   endpoint: 'whoami'
 * })
 */
async function callFromAll({ clients, endpoint, data, concurrent = true, timeout = 1000 }) {
  if (!Array.isArray(clients)) {
    throw new Error('callFromAll: clients array required');
  }

  const makeCall = async (client) => {
    try {
      const result = await call({ client, endpoint, data, timeout });
      return { client, result };
    } catch (error) {
      return { client, error };
    }
  };

  if (concurrent) {
    return Promise.all(clients.map(makeCall));
  }

  const results = [];
  for (const client of clients) {
    results.push(await makeCall(client));
  }
  return results;
}

module.exports = {
  // Core RPC operations
  call,
  callNested,
  callExpect,
  expectError,
  expectTimeout,

  // Batch operations
  callMany,
  callManyExpectSuccess,
  callSequential,
  callWithGenerator,
  callFromAll,

  // Assertions
  assertProperties,
  assertHasKeys,
  assertType,
};
