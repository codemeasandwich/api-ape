/**
 * @fileoverview Chained Publish Proxy for api-ape Server
 *
 * Provides a fluent API for publishing to channels using the same
 * property chaining syntax as the client-side RPC calls.
 *
 * @module server/lib/broadcast/publishProxy
 *
 * @example
 * const { ape } = require('api-ape')
 *
 * // Chained publish syntax
 * ape.publish.news.banking({ headline: 'Market Update' })
 *
 * // Equivalent to:
 * ape.publish('/news/banking', { headline: 'Market Update' })
 */

const { publish } = require("./pubsub");

/**
 * Path segment separator
 * @constant {string}
 * @private
 */
const joinKey = "/";

/**
 * Proxy handler for building publish paths
 *
 * Intercepts property access to accumulate path segments,
 * and intercepts function calls to trigger the publish.
 *
 * @type {ProxyHandler}
 * @private
 */
const handler = {
  /**
   * Intercepts property access to build the path
   *
   * @param {Function} target - The current wrapper function
   * @param {string} key - The property being accessed
   * @returns {Proxy} A new proxy with extended path
   */
  get(target, key) {
    // Build the extended path
    const path = (target._path || "") + joinKey + key;

    // Create a wrapper function for the next level
    const wrapper = function (data) {
      return publish(path, data);
    };

    // Store the path on the function
    wrapper._path = path;

    // Return a new proxy to allow continued chaining
    return new Proxy(wrapper, handler);
  },

  /**
   * Intercepts function calls to trigger the publish
   *
   * @param {Function} target - The wrapper function with accumulated path
   * @param {any} thisArg - The this value
   * @param {Array} args - The arguments (first is data for chained, or channel+data for legacy)
   * @returns {void}
   */
  apply(target, thisArg, args) {
    // If called on root with no path, treat as legacy: publish(channel, data)
    if (target._path === "") {
      return publish(args[0], args[1]);
    }
    // Otherwise, chained call: publish to accumulated path
    return publish(target._path, args[0]);
  },
};

/**
 * Create a chained publish proxy
 *
 * Returns a Proxy object that allows fluent publish syntax:
 * `ape.publish.news.banking(data)` → publishes to '/news/banking'
 *
 * @returns {Proxy} The publish proxy
 *
 * @example
 * const publishProxy = createPublishProxy()
 *
 * // These are equivalent:
 * publishProxy.news.banking({ headline: 'Update' })
 * publish('/news/banking', { headline: 'Update' })
 *
 * // Deep nesting works too:
 * publishProxy.stocks.nasdaq.tech({ price: 100 })
 * // → publishes to '/stocks/nasdaq/tech'
 */
function createPublishProxy() {
  // Root function (never called directly, but needed for the proxy)
  const root = function (channel, data) {
    // Allow direct function call: ape.publish('/channel', data)
    return publish(channel, data);
  };

  root._path = "";

  return new Proxy(root, handler);
}

module.exports = createPublishProxy;
