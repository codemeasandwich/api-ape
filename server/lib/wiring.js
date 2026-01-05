const replySecurity = require('../security/reply')
const socketOpen = require('../socket/open')
const socketReceive = require('../socket/receive')
const socketSend = require('../socket/send')
const makeid = require('../utils/genId')
const parseUserAgent = require('../utils/parseUserAgent');
const { addClient, removeClient, updateClientEmbed, updateClientSend } = require('./broadcast')

// connect, beforeSend, beforeReceive, error, afterSend, afterReceive, disconnect


function defaultEvents(events = {}) {
    const fallBackEvents = {
        embed: {},
        onReceive: () => { },
        onSend: () => { },
        onError: (errSt) => console.error(errSt),
        onDisconnect: () => { },
    } // END fallBackEvents
    return Object.assign({}, fallBackEvents, events)
} // END defaultEvents

//=====================================================
//============================================== wiring
//=====================================================

module.exports = function wiring(controllers, onConnect, fileTransfer) {
    onConnect = onConnect || (() => { });
    return function webSocketHandler(socket, req) {

        let send;
        let sentBufferAr = []
        const sentBufferFn = (...args) => {
            if (send) {
                send(...args)
            } else {
                sentBufferAr.push(args)
            }
        } // END sentBufferFn

        const clientId = makeid(20)
        const agent = parseUserAgent(req.headers['user-agent'])

        // Extract sessionId from cookies (set by outer framework)
        const sessionIdMatch = (req.headers.cookie || '').match(/(?:^|;\s*)sessionId=([^;]*)/)
        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null

        const sharedValues = {
            socket, req, agent, send: (type, data, err) => sentBufferFn(false, type, data, err)
        }
        sharedValues.send.toString = () => clientId

        // Track this client for broadcast BEFORE calling onConnect
        // This ensures ape.clients.size returns the correct count when sending init
        addClient({ clientId, sessionId, agent, send: null, embed: null })

        // Remove client on disconnect (set up early, will work once send is assigned)
        socket.on('close', () => {
            removeClient(clientId)
        })

        let result = onConnect(socket, req, sharedValues.send)
        if (!result || !result.then) {
            result = Promise.resolve(result)
        }
        result.then(defaultEvents)
            .then(({ embed, onReceive, onSend, onError, onDisconnect }) => {
                const isOk = socketOpen(socket, req, onError)

                if (!isOk) {
                    removeClient(clientId) // Clean up if connection fails
                    return;
                }


                const checkReply = replySecurity()
                const ape = {
                    socket,
                    req,
                    clientId,
                    checkReply,
                    events: { onReceive, onSend, onError, onDisconnect },
                    controllers,
                    sharedValues,
                    embedValues: embed,
                    fileTransfer  // Pass file transfer manager
                }// END ape
                send = socketSend(ape)
                ape.send = send

                // Update client with real send function and embed values
                updateClientSend(clientId, send)
                updateClientEmbed(clientId, embed)

                // Call onDisconnect when socket closes
                socket.on('close', () => {
                    onDisconnect()
                })

                sentBufferAr.forEach(args => send(...args))
                sentBufferAr = []
                socket.on('message', socketReceive(ape))
            }) // END result.then

    } // END webSocketHandler
} // END wiring

