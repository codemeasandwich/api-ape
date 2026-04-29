/**
 * api-ape onError handler
 */

function onError(clientID, errStr) {
    console.error(`Error [${clientID}]:`, errStr)
}

module.exports = { onError }
