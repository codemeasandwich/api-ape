const replySecurity  = require( '../security/reply')
const socketOpen     = require( '../socket/open')
const socketReceive  = require( '../socket/receive')
const socketSend     = require( '../socket/send')
const makeid = require( '../utils/genId')      
const UAParser = require('ua-parser-js');
const parser = new UAParser();      

// connent, beforeSend, beforeReceive, error, afterSend, afterReceive, disconnent


function defaultEvents(events={}) {
    const fallBackEvents = {
        embed : {},
        onReceive : ()=>{},
        onSend : ()=>{},
        onError: (errSt)=>console.error(errSt),
        onDisconnent : ()=>{},
    } // END fallBackEvents
    return Object.assign({},fallBackEvents,events)
} // END defaultEvents

//=====================================================
//============================================== wiring
//=====================================================

module.exports = function wiring(controllers, onConnent){
    onConnent = onConnent || (()=>{});
    return function webSocketHandler(socket, req){
        
        let send;
        let sentBufferAr = []
        const sentBufferFn = (...args)=>{
            if (send) {
              send(...args)
            }else{
              sentBufferAr.push(args)
            }
        } // END sentBufferFn
        
        const hostId = makeid(20)
        const agent = parser.setUA(req.headers['user-agent']).getResult()
        const sharedValues = {
            socket, req, agent, send:(type,data,err)=>sentBufferFn(false, type, data, err)
        }
        sharedValues.send.toString = ()=> hostId
        
        
        let result = onConnent(socket, req, sharedValues.send)
        if ( ! result || ! result.then) {
           result = Promise.resolve(result) 
        }
        result.then(defaultEvents)
              .then(({ embed, onReceive, onSend, onError, onDisconnent })=>{
            const isOk = socketOpen(socket, req, onError)
            
            if ( ! isOk) {
               return;
            }
            
            
            const checkReply = replySecurity()
            const ape = {
                socket,
                req,
                hostId,
                checkReply,
                events:{ onReceive, onSend, onError, onDisconnent },
                controllers,
                sharedValues,
                embedValues:embed
            }// END ape
            send = socketSend(ape)
            ape.send = send
            sentBufferAr.forEach(args=>send(...args))
            sentBufferAr = []
            socket.on('message', socketReceive(ape))
        }) // END result.then
        
    } // END webSocketHandler
} // END wiring










