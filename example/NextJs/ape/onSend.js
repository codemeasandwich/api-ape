/**
 * api-ape onSend handler
 */

function onSend(clientID, payload, type) {
    console.log(`[${clientID}] ${type}`)

    return (err, result) => {
        if (err) {
            console.error(`[${clientID}] Send failed:`, err.message)
        }
    }
}

module.exports = { onSend }
