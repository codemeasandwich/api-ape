/**
 * @fileoverview API Proxy Wrapper for Path-Building Syntax
 *
 * Builds endpoint paths from property access only. Dynamic segments use
 * bracket notation; the call itself takes a single payload (or a single
 * callback to subscribe). Path stitching from string arguments is not
 * supported — segments live on the proxy chain, never inside the call.
 *
 * ## How It Works
 *
 * ```
 * api.users                 → path "/users"
 * api.users.create          → path "/users/create"
 * api.users.create({...})   → RPC to "/users/create" with payload
 * api.users[id]({...})      → RPC to "/users/<id>" (dynamic segment)
 * api.users[id].profile()   → RPC to "/users/<id>/profile"
 * api.news.banking(cb)      → subscribe to "/news/banking"
 * api.stock[ticker](cb)     → subscribe to "/stock/<ticker>"
 * ```
 *
 * ## Reserved Keys
 *
 * Certain properties are reserved and bypass proxy interception:
 * - `on` - Subscribe to broadcasts (legacy receiver)
 * - `onConnectionChange` - Subscribe to connection state
 * - `transport` - Get current transport type
 *
 * ## Path Accumulation Invariant
 *
 * Each wrapper stores its accumulated path on `_path`. The next `get`
 * trap appends the new key to that `_path` rather than recursing through
 * a parent function. Subscribe and RPC both read the same `_path`, so
 * chained subscribes (`api.x.y(cb)`) accumulate identically to chained
 * RPCs (`api.x.y(body)`). The previous implementation only accumulated
 * via the RPC recursion path, so `api.x.y(cb)` subscribed to `/y`
 * instead of `/x/y` — see proxy.test.js for the regression cover.
 *
 * @module client/connection/proxy
 * @see {@link module:client/connectSocket} for usage context
 */

import { subscribe } from "./subscriptions.js";

/**
 * Path segment separator used when building endpoint paths
 * @constant {string}
 * @private
 */
const joinKey = "/";

/**
 * Set of property names that should not be intercepted by the proxy.
 *
 * These properties are accessed directly on the wrapped function/object
 * rather than being treated as path segments.
 *
 * Per the Proxy invariant, the `get` trap must return the actual value
 * for non-configurable, non-writable data properties (e.g. `api.on`
 * defined on the proxy target in browser.js). Returning a synthetic
 * wrapper for those triggers a TypeError. Listing them here makes the
 * trap short-circuit and satisfy the invariant.
 *
 * @constant {Set<string>}
 * @private
 */
const reservedKeys = new Set(["on", "onConnectionChange", "transport"]);

/**
 * Wrap an API sender function in a Proxy for path-building syntax.
 *
 * The returned proxy intercepts every property access to extend an
 * accumulated path (`_path`). Calling any wrapped node dispatches:
 * - `wrapped(callback)`  → `subscribe(_path, callback)` and returns the unsubscribe fn
 * - `wrapped(payload)`   → `api(_path, payload)` and returns the sender's Promise
 * - `wrapped()`          → `api(_path, undefined)` (no payload)
 *
 * Dynamic path segments are expressed with bracket access — e.g.
 * `api.users[userId](body)` — so the call itself always receives the
 * payload (or callback) only. There is no two-argument form.
 *
 * @param {Function} api - The sender function. Signature: `(path, data) => Promise`.
 * @returns {Proxy} Proxied API root.
 *
 * @example
 * const sender = (path, data) => fetch(`/api${path}`, { method: 'POST', body: JSON.stringify(data) })
 * const api = wrap(sender)
 *
 * // Simple endpoint
 * api.ping()                                  // → sender('/ping', undefined)
 *
 * // RPC with payload
 * api.users.create({ name: 'Alice' })         // → sender('/users/create', { name: 'Alice' })
 *
 * // Dynamic segment via bracket access
 * api.users[123]()                            // → sender('/users/123', undefined)
 * api.users[123]({ name: 'Alice' })           // → sender('/users/123', { name: 'Alice' })
 * api.users[id].profile({ avatar: 'a.png' })  // → sender('/users/<id>/profile', ...)
 *
 * // Subscription (single function argument)
 * const unsub = api.news.banking(data => console.log(data))
 * const unsub2 = api.stock[ticker](data => console.log(data))
 *
 * // Reserved properties are pass-through
 * api.on('event', handler)
 * api.onConnectionChange(handler)
 * console.log(api.transport)
 */
export function wrap(api) {
  // Handler closes over `api` so every wrapper dispatches to the same
  // root sender. No parent-wrapper recursion: path lives on `_path`.
  const handler = {
    /**
     * Proxy `get` trap. Builds the accumulated path for the next chain
     * step or, for reserved/Symbol/`then` keys, returns the raw target
     * property so the proxy stays compatible with the Proxy invariant,
     * iteration, and the thenable protocol.
     *
     * @param {Function|Object} target - The wrapped function or root sender
     * @param {string|symbol} key - The property being accessed
     * @returns {Function|any} Either the reserved/raw value or a new
     *   proxy-wrapped dispatcher whose `_path` extends `target._path`.
     */
    get(target, key) {
      // Reserved keys bypass interception. Returning the synthetic
      // wrapper for a non-configurable property would violate the
      // Proxy invariant.
      if (reservedKeys.has(key)) {
        return target[key];
      }

      // Non-string keys (Symbols like Symbol.toPrimitive, Symbol.iterator,
      // or "then" probing during Promise resolution) must not extend the
      // path. Returning the raw target property keeps the proxy compatible
      // with stringification, iteration, and the await/thenable protocols.
      if (typeof key !== "string" || key === "then") {
        return target[key];
      }

      // Accumulate the path on this wrapper. Read parent's `_path`
      // (empty string on the root) so each chain step appends one
      // segment regardless of dispatch mode (RPC vs subscribe).
      const path = (target._path || "") + joinKey + key;

      // Dispatch function: single argument is either a subscription
      // callback or an RPC payload. No second argument is accepted —
      // dynamic segments belong on the proxy chain via bracket access.
      const wrapper = function (payload) {
        if (typeof payload === "function") {
          return subscribe(path, payload);
        }
        return api(path, payload);
      };

      // Store the path so the next `get` can extend it.
      wrapper._path = path;

      // Wrap for continued chaining.
      return new Proxy(wrapper, handler);
    },
  };

  return new Proxy(api, handler);
}
