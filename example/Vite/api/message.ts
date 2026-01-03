/**
 * Message controller for api-ape
 * Called when client sends type="message"
 * 
 * Uses this.broadcastOthers from api-ape to broadcast to all other clients
 */

// In-memory message store
const messages: Array<{ user: string; text: string; time: string }> = []
const MAX_MESSAGES = 100

interface MessageData {
    user: string
    text: string
}

interface MessageContext {
    broadcastOthers: (type: string, data: any) => void
}

/**
 * Message handler - receives { user, text } from client
 * Broadcasts to all OTHER clients, returns to sender
 */
function message(this: MessageContext, data: MessageData) {
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
export function getHistory() {
    return messages.slice(-50)
}

export default message
