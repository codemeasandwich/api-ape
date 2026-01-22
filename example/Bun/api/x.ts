const messages: Array<{ user: string; text: string }> = []

/**
 * Broadcast a message to all other connected clients
 *
 * @param {Object} data - Message data
 * @param {string} data.user - The username of the sender
 * @param {string} data.text - The message text content
 * @returns {{user: string, text: string}} The sent message
 */
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
