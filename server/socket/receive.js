const messageHash = require('../../utils/messageHash')
const { broadcast, online, getClients } = require('../lib/broadcast')

module.exports = function receiveHandler(ape) {
    const { send, checkReply, events, controllers, sharedValues, hostId, embedValues } = ape

    // Build `this` context for controllers
    // Includes: client metadata + api-ape utilities
    const that = {
        ...sharedValues,
        ...embedValues,
        // api-ape utilities available via `this`
        broadcast: (type, data) => broadcast(type, data),
        broadcastOthers: (type, data) => broadcast(type, data, hostId), // exclude self
        online,
        getClients,
        hostId
    }

    return function onReceive(msg) {
        const queryId = messageHash(msg);
        try {
            const { type: rawType, data, referer, createdAt, requestedAt } = JSON.parse(msg);

            // Normalize type: strip leading slash, lowercase
            const type = rawType.replace(/^\//, '').toLowerCase()

            // Call onReceive hook - it should return a finish callback
            const onFinish = events.onReceive(queryId, data, type) || (() => { })

            const result = new Promise((resolve, reject) => {
                try {
                    const controller = controllers[type]
                    if (!controller) {
                        throw `TypeError: "${type}" was not found`
                    }
                    checkReply(queryId, createdAt)
                    resolve(controller.call(that, data))
                } catch (err) {
                    reject(err)
                }
            })
            result.then(val => {
                if (undefined !== val) {
                    send(queryId, false, val, false)
                }
                if (typeof onFinish === 'function') {
                    onFinish(false, val)
                }
            }).catch(err => {
                send(queryId, false, false, err)
                if (typeof onFinish === 'function') {
                    onFinish(err, true)
                }
            })

        } catch (err) {
            const errMessage = err.message || err
            events.onError(hostId, queryId, errMessage)
        } // END catch

    } // END onReceive
} // END receiveHandler