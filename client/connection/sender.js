/**
 * Message sending logic for WebSocket transport
 * @module client/connection/sender
 */

import messageHash from '../../utils/messageHash'
import jss from '../../utils/jss'
import { processBinaryForUpload, uploadBinaryData } from './fileHandling'

const totalRequestTimeout = 10000
const connectTimeout = 5000

/**
 * Create WebSocket send function
 * @param {Function} getSocket - Function returning current socket
 * @param {Object} waitingOn - Map of queryId -> callback
 * @returns {Function} wsSend function
 */
export function createWsSend(getSocket, waitingOn) {
    return function wsSend(type, data, createdAt, dirctCall) {
        let rej, promiseIsLive = false;
        const timeLetForReqToBeMade = (createdAt + totalRequestTimeout) - Date.now()

        const timer = setTimeout(() => {
            if (promiseIsLive) {
                rej(new Error("Request Timedout for :" + type))
            }
        }, timeLetForReqToBeMade);

        const { processedData, uploads } = processBinaryForUpload(data)

        const payload = {
            type,
            data: processedData,
            createdAt: new Date(createdAt),
            requestedAt: dirctCall ? undefined : new Date()
        }
        const message = jss.stringify(payload)
        const queryId = messageHash(message);

        const replyPromise = new Promise((resolve, reject) => {
            rej = reject
            waitingOn[queryId] = (err, result) => {
                clearTimeout(timer)
                replyPromise.then = next.bind(replyPromise)
                if (err) {
                    reject(err)
                } else {
                    resolve(result)
                }
            }
            getSocket().send(message);

            if (uploads.length > 0) {
                uploadBinaryData(queryId, uploads).catch(err => {
                    console.error('🦍 Binary upload failed:', err)
                })
            }
        });

        const next = replyPromise.then;
        replyPromise.then = worker => {
            promiseIsLive = true;
            replyPromise.then = next.bind(replyPromise)
            replyPromise.catch = err.bind(replyPromise)
            return next.call(replyPromise, worker)
        }
        const err = replyPromise.catch;
        replyPromise.catch = worker => {
            promiseIsLive = true;
            replyPromise.catch = err.bind(replyPromise)
            replyPromise.then = next.bind(replyPromise)
            return err.call(replyPromise, worker)
        }
        return replyPromise
    }
}

/**
 * Create sender function that queues messages when not ready
 * @param {Function} isReady - Function returning ready state
 * @param {Function} getSendFn - Function returning current send function
 * @param {Array} waitingQueue - Queue for pending messages
 * @param {Function} connectFn - Function to initiate connection
 * @returns {Function} sender function
 */
export function createSender(isReady, getSendFn, waitingQueue, connectFn) {
    return function sender(type, data) {
        if ("string" !== typeof type) {
            throw new Error("Missing Path vaule")
        }

        const createdAt = Date.now()

        if (isReady()) {
            return getSendFn()(type, data, createdAt, true)
        }

        const timeLetForReqToBeMade = (createdAt + connectTimeout) - Date.now()

        const payload = { type, data, resolve: undefined, reject: undefined, waiting: false, createdAt, timer: null };

        payload.timer = setTimeout(() => {
            const errMessage = "Request not sent for :" + type
            if (payload.waiting) {
                payload.reject(new Error(errMessage))
            } else {
                throw new Error(errMessage)
            }
        }, timeLetForReqToBeMade);

        const waitingOnOpen = new Promise((res, rej) => {
            payload.resolve = res;
            payload.reject = rej;
        })

        const waitingOnOpenThen = waitingOnOpen.then;
        const waitingOnOpenCatch = waitingOnOpen.catch;

        waitingOnOpen.then = worker => {
            payload.waiting = true;
            waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen)
            waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen)
            return waitingOnOpenThen.call(waitingOnOpen, worker)
        }

        waitingOnOpen.catch = worker => {
            payload.waiting = true;
            waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen)
            waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen)
            return waitingOnOpenCatch.call(waitingOnOpen, worker)
        }

        waitingQueue.push(payload)
        connectFn()

        return waitingOnOpen
    }
}
