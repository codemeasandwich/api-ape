/**
 * @fileoverview API Proxy Wrapper for Path-Building Syntax
 *
 * This module provides the Proxy wrapper that enables api-ape's fluent
 * path-building API syntax. It intercepts property access to construct
 * endpoint paths dynamically.
 *
 * ## How It Works
 *
 * The proxy intercepts property access and returns new proxy-wrapped functions.
 * Each property access adds a segment to the path, and calling the function
 * sends the request.
 *
 * ```
 * api.users           → wraps path "/users"
 * api.users.create    → wraps path "/users/create"
 * api.users({ ... })  → calls "/users" with data
 * api.users('/123')   → calls "/users/123"
 * ```
 *
 * ## Reserved Keys
 *
 * Certain properties are reserved and bypass proxy interception:
 * - `on` - Subscribe to broadcasts
 * - `onConnectionChange` - Subscribe to connection state
 * - `transport` - Get current transport type
 *
 * @module client/connection/proxy
 * @see {@link module:client/connectSocket} for usage context
 *
 * @example
 * import { wrap } from './proxy'
 *
 * // Wrap a sender function
 * const api = wrap((path, data) => {
 *   console.log(`Calling ${path} with`, data)
 *   return fetch(path, { body: JSON.stringify(data) })
 * })
 *
 * // Now use fluent API
 * api.users({ name: 'Alice' })        // Calls "/users"
 * api.users.profile({ id: 1 })        // Calls "/users/profile"
 * api.chat.messages('/room1', {...})  // Calls "/chat/messages/room1"
 */

import { subscribe } from "./subscriptions.js";

/**
 * Path segment separator used when building endpoint paths
 * @constant {string}
 * @private
 */
const joinKey = "/";

/**
 * Set of property names that should not be intercepted by the proxy
 *
 * These properties are accessed directly on the wrapped function/object
 * rather than being treated as path segments.
 *
 * @constant {Set<string>}
 * @private
 */
const reservedKeys = new Set(["onConnectionChange", "transport"]);

/**
 * Proxy handler object that implements the path-building behavior
 *
 * The `get` trap intercepts property access to either:
 * 1. Return the actual property if it's a reserved key
 * 2. Return a new wrapped function that extends the path
 *
 * @type {ProxyHandler<Function>}
 * @private
 *
 * @example
 * // When you access api.users:
 * // 1. handler.get is called with key="users"
 * // 2. Returns a new function that prepends "/users" to the path
 * // 3. That function is also wrapped in a Proxy for chaining
 */
const handler = {
  /**
   * Proxy get trap - intercepts property access
   *
   * @param {Function} fn - The wrapped sender function
   * @param {string|symbol} key - The property name being accessed
   * @returns {Function|any} Either the reserved property value or a new wrapped function
   *
   * @description
   * For non-reserved keys, returns a wrapper function that:
   * - Takes 0, 1, or 2 arguments
   * - With 2 args: first is path suffix, second is data
   * - With 1 arg: it's the data (no path suffix)
   * - Prepends the key as a path segment
   * - Returns a Promise from the underlying sender
   *
   * @example
   * // api.users.create({ name: 'Bob' })
   * // → handler.get(fn, 'users') returns wrappedUsers
   * // → handler.get(wrappedUsers, 'create') returns wrappedCreate
   * // → wrappedCreate({ name: 'Bob' }) calls fn('/users/create', { name: 'Bob' })
   */
  get(fn, key) {
    // Skip proxy interception for reserved keys - return actual property
    if (reservedKeys.has(key)) {
      return fn[key];
    }

    /**
     * Wrapper function that builds the path and forwards to the sender
     *
     * @param {string|any|Function} a - Either a path suffix (if 2 args), data payload, or subscription callback
     * @param {any} [b] - The data payload (if 2 args)
     * @returns {Promise<any>|Function} Promise resolving to server response, or unsubscribe function for subscriptions
     *
     * @example
     * // Single argument - data only (RPC call)
     * api.users({ name: 'Alice' })
     * // → path="/users", body={ name: 'Alice' }
     *
     * @example
     * // Single argument - function (subscription)
     * api.news.banking(data => console.log(data))
     * // → subscribes to "/news/banking", returns unsubscribe function
     *
     * @example
     * // Two arguments - path suffix + data
     * api.users('/123', { name: 'Alice' })
     * // → path="/users/123", body={ name: 'Alice' }
     *
     * @example
     * // Two arguments - nested path + data
     * api.users('/123/profile', { avatar: 'new.png' })
     * // → path="/users/123/profile", body={ avatar: 'new.png' }
     */
    const wrapperFn = function (a, b) {
      let path = joinKey + key,
        body;

      // If single argument is a function, this is a subscription
      if (arguments.length === 1 && typeof a === "function") {
        return subscribe(path, a);
      }

      if (2 === arguments.length) {
        // Two arguments: first is path suffix, second is body
        path += a;
        body = b;
      } else {
        // One or zero arguments: first arg is the body (or undefined)
        body = a;
      }

      return fn(path, body);
    };

    // Wrap the new function in another Proxy to allow continued chaining
    return new Proxy(wrapperFn, handler);
  },
};

/**
 * Wrap an API sender function in a Proxy for path-building syntax
 *
 * This is the main export of the module. It takes a sender function
 * (which accepts path and data) and returns a Proxy that enables
 * the fluent api-ape syntax.
 *
 * @param {Function} api - The sender function to wrap
 * @param {string} api.path - First parameter: the endpoint path
 * @param {any} api.data - Second parameter: the request data/body
 * @returns {Proxy} Proxied API object with path-building capability
 *
 * @example
 * // Basic wrapping
 * const sender = (path, data) => {
 *   return fetch(`/api${path}`, {
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   })
 * }
 *
 * const api = wrap(sender)
 *
 * @example
 * // Using the wrapped API
 *
 * // Simple endpoint call
 * api.ping()                    // → sender('/ping', undefined)
 *
 * // With data
 * api.users({ name: 'Alice' })  // → sender('/users', { name: 'Alice' })
 *
 * // Nested paths
 * api.users.list()              // → sender('/users/list', undefined)
 * api.users.create({ ... })     // → sender('/users/create', { ... })
 *
 * // With path parameters
 * api.users('/123')             // → sender('/users/123', undefined)
 * api.users('/123', { ... })    // → sender('/users/123', { ... })
 *
 * // Complex chaining
 * api.chat.rooms('/abc').messages({ text: 'Hi' })
 * // → sender('/chat/rooms/abc', undefined) — first call
 * // Note: Each call is independent; chaining creates separate calls
 *
 * @example
 * // With reserved properties preserved
 * const api = wrap(sender)
 *
 * // These bypass the proxy:
 * api.on('event', handler)           // Calls sender.on()
 * api.onConnectionChange(handler)    // Calls sender.onConnectionChange()
 * console.log(api.transport)         // Accesses sender.transport
 *
 * @example
 * // Real-world usage in api-ape client
 * import { wrap } from './proxy'
 * import { createSender } from './sender'
 *
 * const sender = createSender(/* ... *\/)
 * const client = {
 *   sender: wrap(sender),
 *   // ... other properties
 * }
 *
 * // User code:
 * client.sender.messages({ text: 'Hello!' })
 */
export function wrap(api) {
  return new Proxy(api, handler);
}
