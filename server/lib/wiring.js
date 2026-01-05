const replySecurity = require('../security/reply')
const socketOpen = require('../socket/open')
const socketReceive = require('../socket/receive')
const socketSend = require('../socket/send')
const makeid = require('../utils/genId')
const parseUserAgent = require('../utils/parseUserAgent');
const { addClient, removeClient } = require('./broadcast')

// connent, beforeSend, beforeReceive, error, afterSend, afterReceive, disconnent


function defaultEvents(events = {}) {
    const fallBackEvents = {
        embed: {},
        onReceive: () => { },
        onSend: () => { },
        onError: (errSt) => console.error(errSt),
        onDisconnent: () => { },
    } // END fallBackEvents
    return Object.assign({}, fallBackEvents, events)
} // END defaultEvents

//=====================================================
//============================================== wiring
//=====================================================

module.exports = function wiring(controllers, onConnent, fileTransfer) {
    onConnent = onConnent || (() => { });
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
        const sharedValues = {
            socket, req, agent, send: (type, data, err) => sentBufferFn(false, type, data, err)
        }
        sharedValues.send.toString = () => clientId

        // Track this client for broadcast BEFORE calling onConnent
        // This ensures ape.online() returns the correct count when sending init
        const clientInfo = { clientId, send: null, embed: null }
        addClient(clientInfo)

        // Remove client on disconnect (set up early, will work once send is assigned)
        socket.on('close', () => {
            removeClient(clientInfo)
        })

        let result = onConnent(socket, req, sharedValues.send)
        if (!result || !result.then) {
            result = Promise.resolve(result)
        }
        result.then(defaultEvents)
            .then(({ embed, onReceive, onSend, onError, onDisconnent }) => {
                const isOk = socketOpen(socket, req, onError)

                if (!isOk) {
                    removeClient(clientInfo) // Clean up if connection fails
                    return;
                }


                const checkReply = replySecurity()
                const ape = {
                    socket,
                    req,
                    clientId,
                    checkReply,
                    events: { onReceive, onSend, onError, onDisconnent },
                    controllers,
                    sharedValues,
                    embedValues: embed,
                    fileTransfer  // Pass file transfer manager
                }// END ape
                send = socketSend(ape)
                ape.send = send

                // Update clientInfo with real send function and embed
                clientInfo.send = send
                clientInfo.embed = embed

                // Call onDisconnent when socket closes
                socket.on('close', () => {
                    onDisconnent()
                })

                sentBufferAr.forEach(args => send(...args))
                sentBufferAr = []
                socket.on('message', socketReceive(ape))
            }) // END result.then

    } // END webSocketHandler
} // END wiring

