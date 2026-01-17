/**
 * Message controller for api-ape
 * Called when client sends type="message"
 *
 * Uses this.clients to send to all other connected clients
 */

// In-memory message store
const messages = []
const MAX_MESSAGES = 100

/**
 * Message handler - receives { user, text } from client
 * Sends to all OTHER clients, returns to sender
 */
module.exports = function message(data) {
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
            client.sendTo('message', { message: msg })
        }
    })

    // Return to sender (fulfills promise)
    return { ok: true, message: msg }
}

// Export history for other uses
module.exports.getHistory = () => messages.slice(-50)
