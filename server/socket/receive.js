const messageHash = require('../../utils/messageHash')
const { broadcast, online, getClients } = require('../lib/broadcast')
const jss = require('../../utils/jss')

/**
 * Find B/A tagged properties in data (indicating pending uploads)
 * Returns array of { path, hash, tag }
 */
function findUploadTags(obj, path = '') {
    const uploads = []

    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return uploads
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            uploads.push(...findUploadTags(obj[i], path ? `${path}.${i}` : String(i)))
        }
        return uploads
    }

    for (const key of Object.keys(obj)) {
        // Check for B or A tag (binary upload markers)
        const bMatch = key.match(/^(.+)<!B>$/)
        const aMatch = key.match(/^(.+)<!A>$/)

        if (bMatch) {
            uploads.push({
                path: path ? `${path}.${bMatch[1]}` : bMatch[1],
                hash: obj[key],
                tag: 'B',
                originalKey: key
            })
        } else if (aMatch) {
            uploads.push({
                path: path ? `${path}.${aMatch[1]}` : aMatch[1],
                hash: obj[key],
                tag: 'A',
                originalKey: key
            })
        } else {
            uploads.push(...findUploadTags(obj[key], path ? `${path}.${key}` : key))
        }
    }

    return uploads
}

/**
 * Clean upload tags from data (rename key<!B> to key)
 */
function cleanUploadTags(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(cleanUploadTags)
    }

    const cleaned = {}
    for (const key of Object.keys(obj)) {
        const bMatch = key.match(/^(.+)<!B>$/)
        const aMatch = key.match(/^(.+)<!A>$/)

        if (bMatch) {
            cleaned[bMatch[1]] = obj[key] // Will be replaced with actual data
        } else if (aMatch) {
            cleaned[aMatch[1]] = obj[key] // Will be replaced with actual data
        } else {
            cleaned[key] = cleanUploadTags(obj[key])
        }
    }
    return cleaned
}

/**
 * Set value at nested path
 */
function setValueAtPath(obj, path, value) {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]]
    }

    current[parts[parts.length - 1]] = value
}

/**
 * Extract sessionId cookie from request headers
 */
function getSessionId(req) {
    const cookies = req?.headers?.cookie || ''
    const match = cookies.match(/(?:^|;\s*)sessionId=([^;]*)/)
    return match ? match[1] : null
}

module.exports = function receiveHandler(ape) {
    const { send, checkReply, events, controllers, sharedValues, hostId, embedValues, fileTransfer } = ape

    // Extract sessionId from request cookies (set by outer framework session management)
    const sessionId = getSessionId(sharedValues.req)

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
        hostId,
        sessionId  // Session ID from cookie (set by outer framework)
    }

    return async function onReceive(msg) {
        // Convert Buffer to string - WebSocket messages may arrive as binary
        const msgString = typeof msg === 'string' ? msg : msg.toString('utf8');
        const queryId = messageHash(msgString);
        try {
            const { type: rawType, data, referer, createdAt, requestedAt } = jss.parse(msgString);

            // Normalize type: strip leading slash, lowercase
            const type = rawType.replace(/^\//, '').toLowerCase()

            // Call onReceive hook - it should return a finish callback
            const onFinish = events.onReceive(queryId, data, type) || (() => { })

            // Check for pending uploads (B/A tags)
            let processedData = data
            if (fileTransfer && data) {
                const uploadTags = findUploadTags(data)

                if (uploadTags.length > 0) {
                    console.log(`📤 Waiting for ${uploadTags.length} upload(s) for ${type}`)

                    // Clean the data object
                    processedData = cleanUploadTags(data)

                    // Wait for all uploads
                    try {
                        await Promise.all(uploadTags.map(async ({ path, hash }) => {
                            const uploadData = await fileTransfer.registerUpload(queryId, hash, hostId)
                            setValueAtPath(processedData, path, uploadData)
                        }))
                    } catch (uploadErr) {
                        console.error(`📤 Upload wait failed:`, uploadErr)
                        send(queryId, false, false, uploadErr)
                        if (typeof onFinish === 'function') {
                            onFinish(uploadErr, true)
                        }
                        return
                    }
                }
            }

            const result = new Promise((resolve, reject) => {
                try {
                    const controller = controllers[type]
                    if (!controller) {
                        throw `TypeError: "${type}" was not found`
                    }
                    checkReply(queryId, createdAt)
                    resolve(controller.call(that, processedData))
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