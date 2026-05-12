/**
 * @fileoverview Chained Send Proxy for api-ape Server
 *
 * Provides a fluent API for sending messages to clients using the same
 * property chaining syntax as publish calls.
 *
 * @module server/lib/broadcast/sendProxy
 *
 * @example
 * // Both syntaxes are equivalent:
 * client.send('news/banking', { headline: 'Market Update' })
 * client.send.news.banking({ headline: 'Market Update' })
 */

/**
 * Path segment separator
 * @constant {string}
 * @private
 */
const joinKey = "/";

/**
 * Proxy handler for building send paths
 *
 * Intercepts property access to accumulate path segments,
 * and intercepts function calls to trigger the send.
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
    const sendFn = target._send;

    // Wrapper for this chain level. Its body is the real implementation —
    // the apply trap delegates here so coverage sees the body run.
    const wrapper = function (data) {
      return sendFn(path, data);
    };

    // Store the path and send function on the wrapper
    wrapper._path = path;
    wrapper._send = sendFn;

    // Return a new proxy to allow continued chaining
    return new Proxy(wrapper, handler);
  },

  /**
   * Intercepts function calls to trigger the send
   *
   * @param {Function} target - The wrapper function with accumulated path
   * @param {any} thisArg - The this value
   * @param {Array} args - The arguments (type+data for direct, or just data for chained)
   * @returns {void}
   */
  apply(target, thisArg, args) {
    // Delegate to the target function — root handles the (type, data)
    // signature, wrappers carry their accumulated path in the closure.
    return Reflect.apply(target, thisArg, args);
  },
};

/**
 * Create a chained send proxy
 *
 * Returns a Proxy object that allows fluent send syntax:
 * `client.send.news.banking(data)` → sends to 'news/banking'
 *
 * @param {Function} sendFn - The underlying send function (type, data) => void
 * @returns {Proxy} The send proxy
 *
 * @example
 * const sendProxy = createSendProxy((type, data) => {
 *   console.log(`Sending to ${type}:`, data)
 * })
 *
 * // These are equivalent:
 * sendProxy('news/banking', { headline: 'Update' })
 * sendProxy.news.banking({ headline: 'Update' })
 */
function createSendProxy(sendFn) {
  // Root function — carries the direct `send(type, data)` signature.
  // The apply trap delegates to this body so coverage sees real execution.
  const root = function (type, data) {
    return sendFn(type, data);
  };

  root._path = "";
  root._send = sendFn;

  return new Proxy(root, handler);
}

module.exports = createSendProxy;
