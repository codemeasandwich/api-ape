const messages = []

// Send message → broadcast to others
module.exports = function (data) {
    messages.push(data)
    this.broadcastOthers('message', data)
    return data
}

// Export messages for history
module.exports._messages = messages
