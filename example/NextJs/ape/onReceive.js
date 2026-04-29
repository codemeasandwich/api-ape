/**
 * api-ape onReceive handler
 */

function onReceive(clientID, queryId, payload, type) {
    console.log(`[${clientID}] ${type}:`, JSON.stringify(payload).slice(0, 50))

    return (err, result) => {
        if (err) {
            console.error(`[${clientID}] Error:`, err.message)
        }
    }
}

module.exports = { onReceive }
