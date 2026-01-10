/**
 * Socket receive handler for api-ape
 * @module server/socket/receive
 */

const messageHash = require('../../utils/messageHash')
const { broadcast, clients } = require('../lib/broadcast')
const jss = require('../../utils/jss')
const { findUploadTags, findFileTags, cleanUploadTags, setValueAtPath } = require('./tagUtils')

function getSessionId(req) {
    const cookies = req?.headers?.cookie || ''
    const match = cookies.match(/(?:^|;\s*)sessionId=([^;]*)/)
    return match ? match[1] : null
}

module.exports = function receiveHandler(ape) {
    const { send, checkReply, events, controllers, sharedValues, clientId, embedValues, fileTransfer } = ape
    const sessionId = getSessionId(sharedValues.req)

    const that = {
        ...sharedValues,
        ...embedValues,
        broadcast: (type, data) => broadcast(type, data),
        broadcastOthers: (type, data) => broadcast(type, data, clientId),
        clients,
        clientId,
        sessionId
    }

    return async function onReceive(msg) {
        const msgString = typeof msg === 'string' ? msg : msg.toString('utf8')
        const queryId = messageHash(msgString)

        try {
            const { type: rawType, data, createdAt } = jss.parse(msgString)
            const type = rawType.replace(/^\//, '').toLowerCase()
            const onFinish = events.onReceive(queryId, data, type) || (() => { })

            let processedData = data
            if (fileTransfer && data) {
                const uploadTags = findUploadTags(data)

                if (uploadTags.length > 0) {
                    processedData = cleanUploadTags(data)
                    try {
                        await Promise.all(uploadTags.map(async ({ path, hash }) => {
                            const uploadData = await fileTransfer.registerUpload(queryId, hash, clientId)
                            setValueAtPath(processedData, path, uploadData)
                        }))
                    } catch (uploadErr) {
                        send(queryId, false, false, uploadErr)
                        if (typeof onFinish === 'function') onFinish(uploadErr, true)
                        return
                    }
                }

                const fileTags = findFileTags(data)
                if (fileTags.length > 0) {
                    fileTags.forEach(({ hash }) => fileTransfer.registerStreamingFile(hash, clientId))
                }
            }

            const result = new Promise((resolve, reject) => {
                try {
                    const controller = controllers[type]
                    if (!controller) throw `TypeError: "${type}" was not found`
                    checkReply(queryId, createdAt)
                    resolve(controller.call(that, processedData))
                } catch (err) { reject(err) }
            })

            result.then(val => {
                if (undefined !== val) send(queryId, false, val, false)
                if (typeof onFinish === 'function') onFinish(false, val)
            }).catch(err => {
                send(queryId, false, false, err)
                if (typeof onFinish === 'function') onFinish(err, true)
            })
        } catch (err) {
            events.onError(clientId, queryId, err.message || err)
        }
    }
}