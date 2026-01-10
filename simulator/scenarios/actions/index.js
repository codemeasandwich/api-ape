/**
 * @fileoverview Action Registry - Exports all composable test actions
 *
 * Actions are atomic, reusable test operations that can be composed
 * into complete user story scenarios. They operate through api-ape's
 * public interface only.
 *
 * @module simulator/scenarios/actions
 *
 * @example
 * const { connection, rpc, broadcast } = require('./actions')
 *
 * // Compose actions into a user story
 * const client = await connection.connect({ server })
 * const result = await rpc.call({ client, endpoint: 'echo', data: { msg: 'hi' } })
 * await broadcast.expectReceived({ client, type: 'notification' })
 * await connection.disconnect({ client })
 */

const connection = require('./connection');
const rpc = require('./rpc');
const broadcast = require('./broadcast');
const lifecycle = require('./lifecycle');
const files = require('./files');
const cluster = require('./cluster');
const jss = require('./jss');
const edge = require('./edge-cases');

/**
 * All available action modules
 */
module.exports = {
  /**
   * Connection actions - connect, disconnect, reconnect, transport switching
   * @type {import('./connection')}
   */
  connection,

  /**
   * RPC actions - call endpoints, handle responses, errors, concurrency
   * @type {import('./rpc')}
   */
  rpc,

  /**
   * Broadcast actions - broadcast to all, others, verify receipt
   * @type {import('./broadcast')}
   */
  broadcast,

  /**
   * Lifecycle actions - onConnect, embed, disconnect hooks
   * @type {import('./lifecycle')}
   */
  lifecycle,

  /**
   * File actions - upload, download, client-to-client streaming
   * @type {import('./files')}
   */
  files,

  /**
   * Cluster actions - Forest multi-server scenarios
   * @type {import('./cluster')}
   */
  cluster,

  /**
   * JSS actions - Date, RegExp, Error, Set, Map round-trips
   * @type {import('./jss')}
   */
  jss,

  /**
   * Edge case actions - timeouts, large payloads, rapid requests
   * @type {import('./edge-cases')}
   */
  edge,
};

/**
 * Create a test context with pre-configured harness
 *
 * @param {Object} options - Context options
 * @param {number} [options.basePort=9000] - Starting port for servers
 * @param {boolean} [options.logging=false] - Enable debug logging
 * @returns {Object} Test context with harness and cleanup
 *
 * @example
 * const { createContext } = require('./actions')
 *
 * let ctx
 * beforeEach(async () => {
 *   ctx = await createContext()
 * })
 *
 * afterEach(async () => {
 *   await ctx.cleanup()
 * })
 *
 * it('test', async () => {
 *   const { server, client } = await ctx.harness.createPair()
 * })
 */
async function createContext(options = {}) {
  const { Harness } = require('../../harness');

  const harness = new Harness({
    basePort: options.basePort || 9000,
    logging: options.logging || false,
  });

  return {
    harness,
    cleanup: () => harness.cleanup(),
  };
}

module.exports.createContext = createContext;

/**
 * Utility: Wait for a condition with instant timeout (virtual environment)
 *
 * @param {Function} condition - Function returning true when condition met
 * @param {number} [timeout=100] - Max wait time in ms (short for virtual env)
 * @param {number} [interval=5] - Check interval in ms
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeout = 100, interval = 5) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

module.exports.waitFor = waitFor;

/**
 * Utility: Immediate promise resolution (no actual delay in virtual env)
 *
 * @param {number} [ms=0] - Nominal delay (executes immediately)
 * @returns {Promise<void>}
 */
async function tick(ms = 0) {
  return new Promise((r) => setImmediate(r));
}

module.exports.tick = tick;

/**
 * Utility: Assert a condition, throw with message if false
 *
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

module.exports.assert = assert;

/**
 * Utility: Assert two values are deeply equal
 *
 * @param {any} actual - Actual value
 * @param {any} expected - Expected value
 * @param {string} [message] - Optional error message
 */
function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(
      message ||
        `Expected ${expectedStr} but got ${actualStr}`
    );
  }
}

module.exports.assertEqual = assertEqual;
