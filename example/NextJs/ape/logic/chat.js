/**
 * Chat controller for api-ape
 * Uses this.clients to send to all other connected clients
 */
const { ape } = require('api-ape')

// In-memory message store
const messages = []
const MAX_MESSAGES = 100

/**
 * Message controller - called when client sends type="message"
 * Uses this.clients to send to all OTHER clients
 */
function message(data) {
    const { user, text } = data

    if (!user || !text) {
        throw new Error('Missing user or text')
    }

    const msg = {
        user,
        text,
        time: new Date().toISOString()
    }

    // Store message
    messages.push(msg)
    if (messages.length > MAX_MESSAGES) {
        messages.shift()
    }

    // Send to all OTHER clients (exclude sender)
    this.clients.forEach((client) => {
        if (client.clientId !== this.clientId) {
            client.send('message', { message: msg })
        }
    })

    // Return to sender (fulfills promise)
    return { ok: true, message: msg }
}

/**
 * Get message history
 */
function history() {
    return messages.slice(-50)
}

/**
 * Get history controller - called when client sends type="history"
 */
function getHistory() {
    return {
        history: history(),
        users: ape.clients.size
    }
}

module.exports = {
    message,
    history: getHistory,
    _history: history  // internal use
}
