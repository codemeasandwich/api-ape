/**
 * Message controller for api-ape
 * Called when client sends type="message"
 * 
 * Uses this.broadcastOthers from api-ape to broadcast to all other clients
 */

// In-memory message store
const messages = []
const MAX_MESSAGES = 100

/**
 * Message handler - receives { user, text } from client
 * Broadcasts to all OTHER clients, returns to sender
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

    // Broadcast to all OTHER clients (exclude sender)
    // this.broadcastOthers is provided by api-ape!
    this.broadcastOthers('message', { message: msg })

    // Return to sender (fulfills promise)
    return { ok: true, message: msg }
}

// Export history for other uses
module.exports.getHistory = () => messages.slice(-50)
