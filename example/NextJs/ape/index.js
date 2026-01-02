/**
 * api-ape handlers - main export
 */

const { onConnect, history, online } = require('./onConnect')
const { createEmbed } = require('./embed')
const { onReceive } = require('./onReceive')
const { onSend } = require('./onSend')
const { onError } = require('./onError')
const { onDisconnect } = require('./onDisconnect')
const chat = require('./logic/chat')

module.exports = {
    onConnect,
    history,
    online,
    createEmbed,
    onReceive,
    onSend,
    onError,
    onDisconnect,
    chat
}
