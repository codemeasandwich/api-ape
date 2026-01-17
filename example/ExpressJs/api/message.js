const messages = []

// Send message → send to all other clients
module.exports = function (data) {
    messages.push(data)
    // Send to all clients except the sender
    this.clients.forEach((client) => {
        if (client.clientId !== this.clientId) {
            client.send('message', data)
        }
    })
    return data
}

// Export messages for history
module.exports._messages = messages
