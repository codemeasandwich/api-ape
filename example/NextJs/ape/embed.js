/**
 * api-ape embed data
 */

function createEmbed(clientID, sessionID) {
    return {
        clientID,
        sessionID: sessionID || 'session-' + clientID,
    }
}

module.exports = { createEmbed }
