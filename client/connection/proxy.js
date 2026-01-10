/**
 * API proxy wrapper for path-building syntax
 * @module client/connection/proxy
 */

const joinKey = "/"
// Properties accessed directly on `ape` that should NOT be intercepted
const reservedKeys = new Set(['on', 'onConnectionChange', 'transport'])

const handler = {
    get(fn, key) {
        // Skip proxy interception for reserved keys - return actual property
        if (reservedKeys.has(key)) {
            return fn[key]
        }
        const wrapperFn = function (a, b) {
            let path = joinKey + key, body;
            if (2 === arguments.length) {
                path += a
                body = b
            } else {
                body = a
            }
            return fn(path, body)
        }
        return new Proxy(wrapperFn, handler)
    }
}

/**
 * Wrap API function in a Proxy for path building
 * @param {Function} api - The sender function to wrap
 * @returns {Proxy} Proxied API object
 */
export function wrap(api) {
    return new Proxy(api, handler)
}
