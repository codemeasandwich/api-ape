const messages: Array<{ user: string; text: string }> = []

// Send message → broadcast to others
module.exports = function (this: any, data: { user: string; text: string }) {
    messages.push(data)
    this.broadcastOthers('message', data)
    return data
}

// Export messages for history
module.exports._messages = messages
