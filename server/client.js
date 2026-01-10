/**
 * api-ape Node.js client - mirrors browser API exactly
 * @module server/client
 */

const {
    ConnectionState, connect, close, queueOrSend, on, onConnectionChange, isReady
} = require('./client/connection')

const joinKey = '/'

const handler = {
    get(target, prop) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop)
        if (prop === 'on') return on
        if (prop === 'onConnectionChange') return onConnectionChange
        if (prop === 'transport') return isReady() ? 'websocket' : null
        if (prop === 'connect') return connect
        if (prop === 'close') return close
        if (prop === 'then' || prop === 'catch') return undefined

        const wrapperFn = function (a, b) {
            let path = joinKey + prop, body
            if (arguments.length === 2 && typeof a === 'string') {
                path += a
                body = b
            } else {
                body = a
            }
            return queueOrSend(path, body)
        }
        return new Proxy(wrapperFn, handler)
    }
}

const api = new Proxy({}, handler)

Object.defineProperty(api, 'on', { value: on, writable: false, enumerable: false, configurable: false })
Object.defineProperty(api, 'onConnectionChange', { value: onConnectionChange, writable: false, enumerable: false, configurable: false })
Object.defineProperty(api, 'connect', { value: connect, writable: false, enumerable: false, configurable: false })
Object.defineProperty(api, 'close', { value: close, writable: false, enumerable: false, configurable: false })

module.exports = api
module.exports.default = api
module.exports.on = on
module.exports.onConnectionChange = onConnectionChange
module.exports.connect = connect
module.exports.close = close
module.exports.ConnectionState = ConnectionState
module.exports._queueOrSend = queueOrSend
