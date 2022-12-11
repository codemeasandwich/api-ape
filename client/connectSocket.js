import messageHash from '../utls/messageHash'


let connect;


const hostname = window.location.hostname
const localServers = ["localhost","127.0.0.1","[::1]"]
const isLocal = localServers.includes(hostname)
const isHttps = "https" === window.location.href.split(':')[0]
const socketUrl = `ws${isHttps ? "s" : ""}://${isLocal? hostname+":9010" : "my.domain.me"}/api/ape`
let reconnect = false
const      connentTimeout = 5000
const totalRequestTimeout = 10000
//const location = window.location

const joinKey = "/"
const handler = {
 get(fn, key) {
    const wrapperFn = function(a,b){
      let path = joinKey+key,body;
      if(2 === arguments.length){
        path += a
        body = b
      } else {
        body = a
      }
      return fn(path, body)
    }
    return new Proxy(wrapperFn,handler)
 } // END get
}

function wrap(api) {
  return new Proxy(api,handler)
}

  let __socket = false, ready = false, wsSend = false;
  const waitingOn = {};
  const reciverOn = [];

  let aWaitingSend = []
const reciverOnAr = [];
const ofTypesOb = {};

  function connectSocket() {

    if ( ! __socket) {
      __socket = new WebSocket(socketUrl)

      __socket.onopen = event => {
        //console.log('socket connected()');
        ready = true;
        aWaitingSend.forEach(({type, data, next, err, waiting, createdAt, timer}) => {
          clearTimeout(timer)
          //TODO: clear throw of wait for server
          const resultPromise = wsSend(type, data, createdAt)
          if (waiting) {
            resultPromise.then(next)
                         .catch(err)
          }
        })
        // cloudfler drops the connetion and the client has to remake,
        // we clear the array as we dont need this info every RE-connent
        aWaitingSend = []
      } // END onopen

      __socket.onmessage = function(event) {
        //console.log('WebSocket message:', event);
        const { err, type, queryId, data } = JSON.parse(event.data)

        if (queryId
        && waitingOn[queryId]) {
          waitingOn[queryId](err,data)
          delete waitingOn[queryId]
          return
        }
        if (ofTypesOb[type]) {
          ofTypesOb[type].forEach(worker => worker({ err, type, data }))
        } // if ofTypesOb[type]
        reciverOnAr.forEach(worker => worker({ err, type, data }))

      } // END onmessage

      __socket.onerror = function(err) {
        console.error('socket ERROR:', err);
      } // END onerror

      __socket.onclose = function(event) {
        console.warn('socket disconnect:', event);
        __socket = false
        ready = false;
        setTimeout(()=>reconnect && connectSocket(), 500);
      } // END onclose

    } // END if ! __socket
      wsSend = function (type, data, createdAt, dirctCall) {
        let rej, promiseIsLive = false;
        const timeLetForReqToBeMade = (createdAt+totalRequestTimeout) - Date.now()

        const timer = setTimeout(()=> {
          if (promiseIsLive) {
            rej(new Error("Request Timedout for :"+type))
          }
        }, timeLetForReqToBeMade);
        const payload = {
          type,
          data,
          //referer:window.location.href,
          createdAt,
          requestedAt:dirctCall ? undefined
                                : Date.now()
        }
        const message = JSON.stringify(payload)
        const queryId = messageHash(message);

        const replyPromise = new Promise((resolve, reject) => {
          rej = reject
          waitingOn[queryId] = (err,result) => {
                                  clearTimeout(timer)
                                  replyPromise.then = next.bind(replyPromise)
                                  if(err){
                                    reject(err)
                                  } else {
                                    resolve(result)
                                  }
                               }
          __socket.send(message);
        });
        const next = replyPromise.then;
        replyPromise.then = worker => {
          promiseIsLive = true;
          replyPromise.then = next.bind(replyPromise)
          replyPromise.catch = err.bind(replyPromise)
          return next.call(replyPromise,worker)
        }
        const err = replyPromise.catch;
        replyPromise.catch = worker => {
          promiseIsLive = true;
          replyPromise.catch = err.bind(replyPromise)
          replyPromise.then = next.bind(replyPromise)
          return err.call(replyPromise,worker)
        }
        return replyPromise
      } // END wsSend


    const sender = (type, data) => {
          if("string" !== typeof type){
               throw new Error("Missing Path vaule")
           }

          const createdAt = Date.now()

          if (ready) {
            return wsSend(type, data, createdAt, true)
          }

          const timeLetForReqToBeMade = (createdAt+connentTimeout) - Date.now() // 5sec for reconnent

          const timer = setTimeout(()=> {
              const errMessage = "Request not sent for :"+type
              if (payload.waiting) {
                payload.err(new Error(errMessage))
              }else{
                throw new Error(errMessage)
              }
          }, timeLetForReqToBeMade);

          const payload = {type, data, next:undefined, err:undefined, waiting:false, createdAt, timer};
          const waitingOnOpen = new Promise((res,er) => { payload.next = res; payload.err  = er; })

          const waitingOnOpenThen  = waitingOnOpen.then;
          const waitingOnOpenCatch = waitingOnOpen.catch;
          waitingOnOpen.then = worker => {
            payload.waiting = true;
            waitingOnOpen.then  = waitingOnOpenThen.bind(waitingOnOpen)
            waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen)
            return waitingOnOpenThen.call(waitingOnOpen,worker)
          }
          waitingOnOpen.catch = worker => {
            payload.waiting = true;
            waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen)
            waitingOnOpen.then  = waitingOnOpenThen.bind(waitingOnOpen)
            return waitingOnOpenCatch.call(waitingOnOpen,worker)
          }

          aWaitingSend.push(payload)
          if( ! __socket){
            connectSocket()
          }

        return waitingOnOpen
      } // END sender

    return {
      sender : wrap(sender),
    setOnReciver: (onTypeStFn,handlerFn) => {
      if ("string" === typeof onTypeStFn) {
        ofTypesOb[onTypeStFn] = ofTypesOb[onTypeStFn] || []
        ofTypesOb[onTypeStFn].push(handlerFn)
      } else {
        reciverOnAr.push(onTypeStFn)
      }
    } // END setOnReciver
  } // END return
} // END connectSocket

  connectSocket.autoReconnect = ()=> reconnect = true
  connect = connectSocket

export default connect;
