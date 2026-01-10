/**
 * Core client socket connection module for api-ape
 * Handles WebSocket connections with automatic fallback to HTTP streaming
 * @module client/connectSocket
 */

import jss from '../utils/jss'
import { createStreamingTransport } from './transports/streaming'
import { ConnectionState, notifyConnectionChange, onConnectionChange } from './connection/state'
import { getSocketUrl, checkCaptivePortal, scheduleNetworkRetry, setupOnlineListeners, WS_RETRY_INTERVAL } from './connection/network'
import { fetchLinkedResources, fetchSharedFiles } from './connection/fileDownload'
import { wrap } from './connection/proxy'
import { createWsSend, createSender } from './connection/sender'

let configuredTransport = 'auto'
let currentTransport = null
let streamingTransport = null
let wsRetryTimer = null
const WS_FALLBACK_TIMEOUT = 4000

let __socket = false, ready = false
const waitingOn = {}
let aWaitingSend = []
const receiverArray = []
const ofTypesOb = {}
let reconnect = false

const wsSend = createWsSend(() => __socket, waitingOn)

// Setup listeners on module load (browser only)
if (typeof window !== 'undefined') {
  setupOnlineListeners(attemptConnection)
}

async function processIncomingData(data, err) {
  if (!data || err) return data
  try {
    let result = await fetchLinkedResources(data)
    return await fetchSharedFiles(result)
  } catch (e) {
    console.error(`🦍 Failed to hydrate data:`, e)
    return data
  }
}

function dispatchMessage(type, err, data) {
  if (ofTypesOb[type]) ofTypesOb[type].forEach(w => w({ err, type, data }))
  receiverArray.forEach(w => w({ err, type, data }))
}

function flushWaitingMessages(sendFn) {
  aWaitingSend.forEach(({ type, data, resolve, reject, waiting, createdAt, timer }) => {
    clearTimeout(timer)
    const result = sendFn(type, data, createdAt)
    if (waiting) result.then(resolve).catch(reject)
  })
  aWaitingSend = []
}

function switchToStreaming() {
  console.log('🦍 Switching to HTTP streaming transport')
  currentTransport = 'polling'

  if (!streamingTransport) {
    streamingTransport = createStreamingTransport()

    streamingTransport.onMessage = async (msg) => {
      const data = await processIncomingData(msg.data, msg.err)
      dispatchMessage(msg.type, msg.err, data)
    }

    streamingTransport.onOpen = () => {
      ready = true
      notifyConnectionChange(ConnectionState.Connected)
      flushWaitingMessages((t, d, c) => streamingTransport.send(t, d, c))
      startWsRetry()
    }

    streamingTransport.onClose = () => {
      ready = false
      notifyConnectionChange(ConnectionState.Disconnected)
    }

    streamingTransport.onError = (err) => console.error('🦍 Streaming error:', err)
  }

  streamingTransport.connect()
}

function startWsRetry() {
  if (wsRetryTimer || currentTransport !== 'polling' || configuredTransport === 'polling') return
  wsRetryTimer = setInterval(() => {
    if (currentTransport !== 'polling') {
      clearInterval(wsRetryTimer)
      wsRetryTimer = null
      return
    }
    tryWebSocket(true)
  }, WS_RETRY_INTERVAL)
}

function tryWebSocket(isRetry = false) {
  const ws = new WebSocket(getSocketUrl())
  let fallbackTimer = null

  if (!isRetry && configuredTransport === 'auto') {
    fallbackTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close()
        switchToStreaming()
      }
    }, WS_FALLBACK_TIMEOUT)
  }

  ws.onopen = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (isRetry && currentTransport === 'polling') {
      if (streamingTransport) streamingTransport.close()
      if (wsRetryTimer) { clearInterval(wsRetryTimer); wsRetryTimer = null }
    }
    currentTransport = 'websocket'
    __socket = ws
    ready = true
    notifyConnectionChange(ConnectionState.Connected)
    flushWaitingMessages(wsSend)
  }

  ws.onmessage = async (event) => {
    const { err, type, queryId, data } = jss.parse(event.data)
    if (queryId && waitingOn[queryId]) {
      const hydratedData = await processIncomingData(data, err)
      waitingOn[queryId](err, hydratedData)
      delete waitingOn[queryId]
      return
    }
    const processed = await processIncomingData(data, err)
    dispatchMessage(type, err, processed)
  }

  ws.onerror = (err) => {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (!isRetry && configuredTransport === 'auto' && !ready) switchToStreaming()
  }

  ws.onclose = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    __socket = false
    ready = false
    if (currentTransport === 'websocket') {
      notifyConnectionChange(ConnectionState.Disconnected)
      setTimeout(() => reconnect && connectSocket(), 500)
    }
  }
}

async function attemptConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifyConnectionChange(ConnectionState.Offline)
    return
  }
  notifyConnectionChange(ConnectionState.Connecting)
  if (await checkCaptivePortal() === 'walled') {
    notifyConnectionChange(ConnectionState.Walled)
    scheduleNetworkRetry(attemptConnection)
    return
  }
  configuredTransport === 'polling' ? switchToStreaming() : tryWebSocket(false)
}

const sender = createSender(() => ready, () => wsSend, aWaitingSend, connectSocket)

function connectSocket() {
  if (__socket && __socket.readyState !== WebSocket.CLOSED) return buildClientInterface()
  if (currentTransport === 'polling' && streamingTransport?.isConnected()) return buildClientInterface()
  attemptConnection()
  return buildClientInterface()
}

function buildClientInterface() {
  return {
    sender: wrap(sender),
    setOnReceiver: (onTypeStFn, handlerFn) => {
      if (typeof onTypeStFn === 'string') {
        ofTypesOb[onTypeStFn] = [handlerFn]
      } else if (!receiverArray.includes(onTypeStFn)) {
        receiverArray.push(onTypeStFn)
      }
    },
    onConnectionChange,
    get transport() { return currentTransport }
  }
}

connectSocket.autoReconnect = () => reconnect = true
connectSocket.ConnectionState = ConnectionState

export default connectSocket
export { ConnectionState }
