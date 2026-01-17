const messages: Array<{ user: string; text: string }> = []

// Send message → send to all other clients
module.exports = function (this: any, data: { user: string; text: string }) {
    messages.push(data)
    // Send to all clients except the sender
    this.clients.forEach((client: any) => {
        if (client.clientId !== this.clientId) {
            client.send('message', data)
        }
    })
    return data
}

// Export messages for history
module.exports._messages = messages
