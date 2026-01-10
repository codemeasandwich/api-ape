/**
 * Main api-ape entry point
 * Unified signature for all runtimes
 * @module server/lib/main
 */

const loader = require('./loader')
const wiring = require('./wiring')
const { isBun, isDeno, getRuntime } = require('./wsProvider')
const { getFileTransferManager } = require('./fileTransfer')
const { createLongPollingHandler } = require('./longPolling')
const { initNodeServer } = require('./runtimes/node')
const { isBunServer, initBunServerWithReload } = require('./runtimes/bun')

let created = false

/**
 * Create core api-ape handlers (shared between runtimes)
 */
function createApeCore({ where, onConnect, fileTransferOptions }) {
    const controllers = loader(where)
    const fileTransfer = getFileTransferManager(fileTransferOptions)
    const wiringHandler = wiring(controllers, onConnect, fileTransfer)
    const { handleStreamGet, handleStreamPost } = createLongPollingHandler(controllers, onConnect, fileTransfer)

    return {
        controllers,
        fileTransfer,
        wiringHandler,
        handleStreamGet,
        handleStreamPost,
        wsPath: `/${where}/ape`,
        pollPath: `/${where}/ape/poll`,
        pingPath: `/${where}/ape/ping`,
        clientPath: `/${where}/ape.js`,
        clientMapPath: `/${where}/ape.js.map`,
        downloadPattern: `/${where}/ape/data/:hash`,
        uploadPattern: `/${where}/ape/data/:queryId/:pathHash`
    }
}

/**
 * Main api-ape entry point
 * Works with: Node.js http.Server, Express server, Bun.serve() server
 */
module.exports = function (server, options) {
    if (created) {
        throw new Error("Api-Ape already started")
    }
    created = true

    const core = createApeCore(options)

    if (isBunServer(server)) {
        return initBunServerWithReload(server, options, core)
    }

    if (server && typeof server.on === 'function') {
        return initNodeServer(server, options, core)
    }

    throw new Error('Unsupported server type. Expected http.Server (Node.js) or Bun.serve() server.')
}

module.exports.isBun = isBun
module.exports.isDeno = isDeno
module.exports.getRuntime = getRuntime