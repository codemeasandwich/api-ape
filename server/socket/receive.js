const messageHash = require('../../utils/messageHash')

module.exports = function receiveHandler(ape){
    const { send, checkReply, events, controllers, sharedValues } = ape
    const that = { ...sharedValues, ... events.embed }
    return function onReceive(msg){
        const { hostId } = sharedValues
        const queryId = messageHash(msg);
        try{
            const  {  data, referer, createdAt, requestedAt } = JSON.parse(msg);
            
            const result = new Promise((resolve, reject)=>{
                
                const onFinish = events.onReceive(queryId, data, type)
                try{
                    const controller = controllers[type.toLowerCase()]
                    if ( ! controller) {
                        throw `TypeError: "${type}" was not found`
                    }
                    checkReply(queryId,createdAt)
                    resolve(controller.call(that,data))
                }catch(err){
                    reject(err)
                }
            })
            result.then(val =>{
                if (undefined !== val) {
                   send(queryId,false,val,false)
                }
                onFinish(false, val)
            }).catch(err=>{
                send(queryId,false,false,err)
                onFinish(err, true)
            })
            
        }catch(err){
            const errMessage = err.message || err
            events.onError(hostId, queryId, errMessage)
        } // END catch
        
    } // END onReceive
} // END receiveHandler