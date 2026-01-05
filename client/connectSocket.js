import messageHash from '../utils/messageHash'
import jss from '../utils/jss'
import { createStreamingTransport } from './transports/streaming'

let connect;

// Connection state enum
const ConnectionState = {
  Offline: 'offline',         // navigator.onLine = false
  Walled: 'walled',           // Captive portal detected (ping failed)
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Connected: 'connected',
  Closing: 'closing'
}

// Connection state tracking - start with offline check
let connectionState = (typeof navigator !== 'undefined' && !navigator.onLine)
  ? ConnectionState.Offline
  : ConnectionState.Disconnected
const connectionChangeListeners = []

function notifyConnectionChange(newState) {
  if (connectionState !== newState) {
    connectionState = newState
    connectionChangeListeners.forEach(fn => fn(newState))
  }
}

// Configuration
let configuredTransport = 'auto' // 'auto' | 'websocket' | 'polling'

// Transport state
let currentTransport = null // 'websocket' | 'polling'
let streamingTransport = null
let wsRetryTimer = null
let networkCheckTimer = null
const WS_FALLBACK_TIMEOUT = 4000 // Time to wait for WS before fallback
const WS_RETRY_INTERVAL = 30000  // Retry WebSocket while in polling mode
const PING_TIMEOUT = 3000        // Timeout for ping check
const MAX_PING_CLOCK_SKEW = 60000 // Max allowed time difference (60s)

/**
 * Check if running in dev/local mode
 */
function isDevMode() {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
}

/**
 * Build ping URL for captive portal detection
 */
function getPingUrl() {
  const hostname = window.location.hostname
  const localServers = ['localhost', '127.0.0.1', '[::1]']
  const isLocal = localServers.includes(hostname)
  const isHttps = window.location.protocol === 'https:'
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const protocol = isHttps ? 'https' : 'http'
  const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ''
  return `${protocol}://${hostname}${portSuffix}/api/ape/ping`
}

/**
 * Check for captive portal by pinging /api/ape/ping
 * Returns 'ok' if real internet, 'walled' if captive portal detected
 */
async function checkCaptivePortal() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT)

    const response = await fetch(getPingUrl(), {
      cache: 'no-store',
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      if (isDevMode()) {
        console.error('🦍 [DEV] Ping failed: HTTP', response.status)
      }
      return 'walled'
    }

    const data = await response.json()

    // Verify response is genuine (not a captive portal redirect page)
    if (data?.ok !== true) {
      if (isDevMode()) {
        console.error('🦍 [DEV] Ping failed: invalid response', data)
      }
      return 'walled'
    }

    // Validate timestamp to detect proxy replay attacks
    if (typeof data.ts === 'number') {
      const now = Date.now()
      const skew = Math.abs(now - data.ts)
      if (skew > MAX_PING_CLOCK_SKEW) {
        if (isDevMode()) {
          console.error('🦍 [DEV] Ping failed: timestamp too old/stale (skew:', skew, 'ms)')
        }
        return 'walled'
      }
    }

    return 'ok'
  } catch (err) {
    if (isDevMode()) {
      console.error('🦍 [DEV] Ping failed:', err.message || err)
    }
    return 'walled'
  }
}

/**
 * Setup navigator.onLine event listeners
 */
function setupOnlineListeners() {
  if (typeof window === 'undefined') return

  window.addEventListener('online', () => {
    console.log('🦍 Browser went online, checking network...')
    // Trigger reconnection attempt
    attemptConnection()
  })

  window.addEventListener('offline', () => {
    console.log('🦍 Browser went offline')
    notifyConnectionChange(ConnectionState.Offline)
  })
}

// Setup listeners on module load (browser only)
if (typeof window !== 'undefined') {
  setupOnlineListeners()
}



/**
 * Get WebSocket URL - auto-detects from window.location, keeps /api/ape path
 */
function getSocketUrl() {
  const hostname = window.location.hostname
  const localServers = ["localhost", "127.0.0.1", "[::1]"]
  const isLocal = localServers.includes(hostname)
  const isHttps = window.location.protocol === "https:"

  // Default port: 9010 for local dev, otherwise use window.location.port or implicit 443/80
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))

  // Build URL - keep /api/ape path
  const protocol = isHttps ? "wss" : "ws"
  const portSuffix = (isLocal || port !== 80 && port !== 443) ? `:${port}` : ""

  return `${protocol}://${hostname}${portSuffix}/api/ape`
}

let reconnect = false
const connectTimeout = 5000
const totalRequestTimeout = 10000
//const location = window.location

const joinKey = "/"
// Properties accessed directly on `ape` that should NOT be intercepted
const reservedKeys = new Set(['on', 'onConnectionChange', 'transport'])
const handler = {
  get(fn, key) {
    // Skip proxy interception for reserved keys - return actual property
    if (reservedKeys.has(key)) {
      return fn[key]
    }
    const wrapperFn = function (a, b) {
      let path = joinKey + key, body;
      if (2 === arguments.length) {
        path += a
        body = b
      } else {
        body = a
      }
      return fn(path, body)
    }
    return new Proxy(wrapperFn, handler)
  } // END get
}

function wrap(api) {
  return new Proxy(api, handler)
}

let __socket = false, ready = false, wsSend = false;
const waitingOn = {};

let aWaitingSend = []
const receiverArray = [];
const ofTypesOb = {};

/**
 * Switch to streaming transport (HTTP long polling fallback)
 */
function switchToStreaming() {
  console.log('🦍 Switching to HTTP streaming transport')
  currentTransport = 'polling'

  if (!streamingTransport) {
    streamingTransport = createStreamingTransport()

    // Handle incoming messages from streaming transport
    streamingTransport.onMessage = async (msg) => {
      const { err, type, data } = msg

      // Process linked resources and shared files
      let processedData = data
      if (data && !err) {
        try {
          processedData = await fetchLinkedResources(data)
          processedData = await fetchSharedFiles(processedData)
        } catch (fetchErr) {
          console.error(`🦍 Failed to hydrate streaming data:`, fetchErr)
        }
      }

      // Dispatch to type-specific handlers
      if (ofTypesOb[type]) {
        ofTypesOb[type].forEach(worker => worker({ err, type, data: processedData }))
      }
      // Dispatch to general handlers
      receiverArray.forEach(worker => worker({ err, type, data: processedData }))
    }

    streamingTransport.onOpen = () => {
      ready = true
      notifyConnectionChange(ConnectionState.Connected)
      console.log('🦍 HTTP streaming connected')

      // Flush waiting messages
      aWaitingSend.forEach(({ type, data, resolve, reject, waiting, createdAt, timer }) => {
        clearTimeout(timer)
        const resultPromise = streamingSend(type, data, createdAt)
        if (waiting) {
          resultPromise.then(resolve).catch(reject)
        }
      })
      aWaitingSend = []

      // Start background WebSocket retry
      startWsRetry()
    }

    streamingTransport.onClose = () => {
      ready = false
      notifyConnectionChange(ConnectionState.Disconnected)
    }

    streamingTransport.onError = (err) => {
      console.error('🦍 Streaming error:', err)
    }
  }

  streamingTransport.connect()
}

/**
 * Send via streaming transport
 */
function streamingSend(type, data, createdAt) {
  return streamingTransport.send(type, data, createdAt)
}

/**
 * Start background retry for WebSocket (while in polling mode)
 */
function startWsRetry() {
  if (wsRetryTimer) return
  if (currentTransport !== 'polling') return
  if (configuredTransport === 'polling') return // User explicitly wants polling only

  wsRetryTimer = setInterval(() => {
    if (currentTransport !== 'polling') {
      clearInterval(wsRetryTimer)
      wsRetryTimer = null
      return
    }

    console.log('🦍 Attempting WebSocket reconnection...')
    tryWebSocket(true)
  }, WS_RETRY_INTERVAL)
}

/**
 * Try to establish WebSocket connection
 * @param {boolean} isRetry - If true, this is a background retry attempt
 */
function tryWebSocket(isRetry = false) {
  const ws = new WebSocket(getSocketUrl())
  let fallbackTimer = null

  // Set fallback timeout (only for initial connection, not retries)
  if (!isRetry && configuredTransport === 'auto') {
    fallbackTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('🦍 WebSocket timeout, falling back to HTTP streaming')
        ws.close()
        switchToStreaming()
      }
    }, WS_FALLBACK_TIMEOUT)
  }

  ws.onopen = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer)

    // If this is a retry and we're in polling mode, switch back to WebSocket
    if (isRetry && currentTransport === 'polling') {
      console.log('🦍 WebSocket reconnected, switching from HTTP streaming')
      if (streamingTransport) {
        streamingTransport.close()
      }
      if (wsRetryTimer) {
        clearInterval(wsRetryTimer)
        wsRetryTimer = null
      }
    }

    currentTransport = 'websocket'
    __socket = ws
    ready = true
    notifyConnectionChange(ConnectionState.Connected)

    aWaitingSend.forEach(({ type, data, resolve, reject, waiting, createdAt, timer }) => {
      clearTimeout(timer)
      const resultPromise = wsSend(type, data, createdAt)
      if (waiting) {
        resultPromise.then(resolve).catch(reject)
      }
    })
    aWaitingSend = []
  }

  ws.onmessage = async function (event) {
    const { err, type, queryId, data } = jss.parse(event.data)

    // Messages with queryId must fulfill matching promise
    if (queryId) {
      if (waitingOn[queryId]) {
        // Check for linked resources and fetch them before resolving
        if (data && !err) {
          try {
            let hydratedData = await fetchLinkedResources(data)
            hydratedData = await fetchSharedFiles(hydratedData)
            waitingOn[queryId](err, hydratedData)
          } catch (fetchErr) {
            waitingOn[queryId](fetchErr, null)
          }
        } else {
          waitingOn[queryId](err, data)
        }
        delete waitingOn[queryId]
      } else {
        console.error(`🦍 No matching queryId: ${queryId}`)
      }
      return
    }

    // Only messages WITHOUT queryId go to setOnReceiver
    let processedData = data
    if (data && !err) {
      try {
        processedData = await fetchLinkedResources(data)
        processedData = await fetchSharedFiles(processedData)
      } catch (fetchErr) {
        console.error(`🦍 Failed to hydrate broadcast data:`, fetchErr)
      }
    }

    if (ofTypesOb[type]) {
      ofTypesOb[type].forEach(worker => worker({ err, type, data: processedData }))
    }
    receiverArray.forEach(worker => worker({ err, type, data: processedData }))
  }

  ws.onerror = function (err) {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    console.error('socket ERROR:', err)

    // On initial connection error in auto mode, fallback to streaming
    if (!isRetry && configuredTransport === 'auto' && !ready) {
      switchToStreaming()
    }
  }

  ws.onclose = function (event) {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    console.warn('socket disconnect:', event)
    __socket = false
    ready = false

    // Only notify disconnected if we're on websocket transport
    if (currentTransport === 'websocket') {
      notifyConnectionChange(ConnectionState.Disconnected)
      setTimeout(() => reconnect && connectSocket(), 500)
    }
  }
}

/**
 * Find all L-tagged (binary link) properties in data
 * Returns array of { path, hash }
 */
function findLinkedResources(obj, path = '') {
  const resources = []

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return resources
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      resources.push(...findLinkedResources(obj[i], path ? `${path}.${i}` : String(i)))
    }
    return resources
  }

  for (const key of Object.keys(obj)) {
    // Check for L-tag in key (from JJS encoding: key<!L>)
    if (key.endsWith('<!L>')) {
      const cleanKey = key.slice(0, -4)
      const hash = obj[key]
      resources.push({
        path: path ? `${path}.${cleanKey}` : cleanKey,
        hash,
        originalKey: key
      })
    } else {
      resources.push(...findLinkedResources(obj[key], path ? `${path}.${key}` : key))
    }
  }

  return resources
}

/**
 * Find all F-tagged (shared file) properties in data
 * Returns array of { path, hash, originalKey }
 */
function findFileTags(obj, path = '') {
  const files = []

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return files
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      files.push(...findFileTags(obj[i], path ? `${path}.${i}` : String(i)))
    }
    return files
  }

  for (const key of Object.keys(obj)) {
    // Check for F-tag in key (client-to-client shared file marker)
    if (key.endsWith('<!F>')) {
      const cleanKey = key.slice(0, -4)
      const hash = obj[key]
      files.push({
        path: path ? `${path}.${cleanKey}` : cleanKey,
        hash,
        originalKey: key
      })
    } else {
      files.push(...findFileTags(obj[key], path ? `${path}.${key}` : key))
    }
  }

  return files
}

/**
 * Clean up F-tagged keys (rename key<!F> to key)
 */
function cleanFileTags(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanFileTags)
  }

  const cleaned = {}
  for (const key of Object.keys(obj)) {
    if (key.endsWith('<!F>')) {
      const cleanKey = key.slice(0, -4)
      cleaned[cleanKey] = obj[key]
    } else {
      cleaned[key] = cleanFileTags(obj[key])
    }
  }
  return cleaned
}

/**
 * Fetch shared files (client-to-client transfers)
 * Retries if upload is still in progress
 */
async function fetchSharedFiles(data, maxRetries = 5) {
  const files = findFileTags(data)

  if (files.length === 0) {
    return data
  }

  console.log(`🦍 Fetching ${files.length} shared file(s)`)

  const cleanedData = cleanFileTags(data)

  const hostname = window.location.hostname
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  const isHttps = window.location.protocol === "https:"
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const protocol = isHttps ? "https" : "http"
  const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ""
  const baseUrl = `${protocol}://${hostname}${portSuffix}`

  await Promise.all(files.map(async ({ path, hash }) => {
    let retries = 0
    let backoff = 100 // Start with 100ms

    while (retries < maxRetries) {
      try {
        const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
          credentials: 'include'
        })

        if (!response.ok) {
          // 404 might mean file not uploaded yet, retry
          if (response.status === 404 && retries < maxRetries - 1) {
            retries++
            await new Promise(r => setTimeout(r, backoff))
            backoff *= 2 // Exponential backoff
            continue
          }
          throw new Error(`Failed to fetch shared file: ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        setValueAtPath(cleanedData, path, arrayBuffer)

        // Check if upload is still in progress
        const isComplete = response.headers.get('X-Ape-Complete') === '1'
        if (!isComplete) {
          console.log(`🦍 Shared file ${hash} still uploading (${response.headers.get('X-Ape-Total-Received') || '?'} bytes)`)
        }
        break
      } catch (err) {
        if (retries >= maxRetries - 1) {
          console.error(`🦍 Failed to fetch shared file at ${path}:`, err)
          setValueAtPath(cleanedData, path, null)
        }
        retries++
        await new Promise(r => setTimeout(r, backoff))
        backoff *= 2
      }
    }
  }))

  return cleanedData
}

/**
 * Set a value at a nested path in an object
 */
function setValueAtPath(obj, path, value) {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]]
  }

  current[parts[parts.length - 1]] = value
}

/**
 * Clean up L-tagged keys (rename key<!L> to key)
 */
function cleanLinkedKeys(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanLinkedKeys)
  }

  const cleaned = {}
  for (const key of Object.keys(obj)) {
    if (key.endsWith('<!L>')) {
      const cleanKey = key.slice(0, -4)
      cleaned[cleanKey] = obj[key]
    } else {
      cleaned[key] = cleanLinkedKeys(obj[key])
    }
  }
  return cleaned
}

/**
 * Fetch binary resources and hydrate data object
 */
async function fetchLinkedResources(data, clientId) {
  const resources = findLinkedResources(data)

  if (resources.length === 0) {
    return data
  }

  console.log(`🦍 Fetching ${resources.length} binary resource(s)`)

  const cleanedData = cleanLinkedKeys(data)

  const hostname = window.location.hostname
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  const isHttps = window.location.protocol === "https:"
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const protocol = isHttps ? "https" : "http"
  const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ""
  const baseUrl = `${protocol}://${hostname}${portSuffix}`

  await Promise.all(resources.map(async ({ path, hash }) => {
    try {
      const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
        credentials: 'include',
        headers: {
          'X-Ape-Client-Id': clientId || ''
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch binary resource: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      setValueAtPath(cleanedData, path, arrayBuffer)
    } catch (err) {
      console.error(`🦍 Failed to fetch binary resource at ${path}:`, err)
      setValueAtPath(cleanedData, path, null)
    }
  }))

  return cleanedData
}

/**
 * Attempt to establish connection with network pre-checks
 */
async function attemptConnection() {
  // Check if browser is online
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifyConnectionChange(ConnectionState.Offline)
    return
  }

  // Perform captive portal check
  notifyConnectionChange(ConnectionState.Connecting)
  const pingResult = await checkCaptivePortal()

  if (pingResult === 'walled') {
    notifyConnectionChange(ConnectionState.Walled)
    // Retry network check periodically
    scheduleNetworkRetry()
    return
  }

  // Network is good, proceed with socket connection
  proceedWithConnection()
}

/**
 * Schedule a retry of network check (for walled/offline states)
 */
function scheduleNetworkRetry() {
  if (networkCheckTimer) return
  networkCheckTimer = setTimeout(() => {
    networkCheckTimer = null
    attemptConnection()
  }, WS_RETRY_INTERVAL)
}

/**
 * Proceed with WebSocket/polling connection after network checks pass
 */
function proceedWithConnection() {
  // Determine which transport to use
  if (configuredTransport === 'polling') {
    switchToStreaming()
  } else {
    // 'auto' or 'websocket' - try WebSocket first
    tryWebSocket(false)
  }
}

function connectSocket() {
  // Skip if already connected or connecting
  if (__socket && __socket.readyState !== WebSocket.CLOSED) {
    return buildClientInterface()
  }
  if (currentTransport === 'polling' && streamingTransport?.isConnected()) {
    return buildClientInterface()
  }
  if (connectionState === ConnectionState.Connecting) {
    return buildClientInterface()
  }

  // Start connection with network pre-checks
  attemptConnection()

  return buildClientInterface()
}

/**
 * Check if value is binary data (ArrayBuffer, typed array, or Blob)
 */
function isBinaryData(value) {
  if (value === null || value === undefined) return false
  return value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
}

/**
 * Get binary type tag (A for ArrayBuffer, B for Blob)
 */
function getBinaryTag(value) {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return 'B'
  return 'A'
}

/**
 * Generate a simple hash for binary upload
 */
function generateUploadHash(path) {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * Find and extract binary data from payload
 * Returns { processedData, uploads: [{ path, hash, data, tag }] }
 */
function processBinaryForUpload(data, path = '') {
  if (data === null || data === undefined) {
    return { processedData: data, uploads: [] }
  }

  if (isBinaryData(data)) {
    const tag = getBinaryTag(data)
    const hash = generateUploadHash(path || 'root')
    return {
      processedData: { [`__ape_upload__`]: hash },
      uploads: [{ path, hash, data, tag }]
    }
  }

  if (Array.isArray(data)) {
    const processedArray = []
    const allUploads = []

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i)
      const { processedData, uploads } = processBinaryForUpload(data[i], itemPath)
      processedArray.push(processedData)
      allUploads.push(...uploads)
    }

    return { processedData: processedArray, uploads: allUploads }
  }

  if (typeof data === 'object') {
    const processedObj = {}
    const allUploads = []

    for (const key of Object.keys(data)) {
      const itemPath = path ? `${path}.${key}` : key
      const { processedData, uploads } = processBinaryForUpload(data[key], itemPath)

      // If this was binary data, mark the key with <!B> or <!A> tag
      if (uploads.length > 0 && processedData?.__ape_upload__) {
        const tag = uploads[uploads.length - 1].tag
        processedObj[`${key}<!${tag}>`] = processedData.__ape_upload__
      } else {
        processedObj[key] = processedData
      }
      allUploads.push(...uploads)
    }

    return { processedData: processedObj, uploads: allUploads }
  }

  return { processedData: data, uploads: [] }
}

/**
 * Find and extract binary data for SHARING (client-to-client)
 * Uses <!F> tag instead of <!A>/<!B>
 * Returns { processedData, shares: [{ path, hash, data }] }
 */
function processBinaryForSharing(data, path = '') {
  if (data === null || data === undefined) {
    return { processedData: data, shares: [] }
  }

  if (isBinaryData(data)) {
    const hash = generateUploadHash(path || 'share')
    return {
      processedData: { [`__ape_share__`]: hash },
      shares: [{ path, hash, data }]
    }
  }

  if (Array.isArray(data)) {
    const processedArray = []
    const allShares = []

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i)
      const { processedData, shares } = processBinaryForSharing(data[i], itemPath)
      processedArray.push(processedData)
      allShares.push(...shares)
    }

    return { processedData: processedArray, shares: allShares }
  }

  if (typeof data === 'object') {
    const processedObj = {}
    const allShares = []

    for (const key of Object.keys(data)) {
      const itemPath = path ? `${path}.${key}` : key
      const { processedData, shares } = processBinaryForSharing(data[key], itemPath)

      // If this was binary data, mark the key with <!F> tag
      if (shares.length > 0 && processedData?.__ape_share__) {
        processedObj[`${key}<!F>`] = processedData.__ape_share__
      } else {
        processedObj[key] = processedData
      }
      allShares.push(...shares)
    }

    return { processedData: processedObj, shares: allShares }
  }

  return { processedData: data, shares: [] }
}

/**
 * Upload shared files via HTTP PUT
 * Uses different endpoint pattern for streaming files
 */
async function uploadSharedFiles(shares) {
  if (shares.length === 0) return

  // Build base URL
  const hostname = window.location.hostname
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  const isHttps = window.location.protocol === "https:"
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const protocol = isHttps ? "https" : "http"
  const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ""
  const baseUrl = `${protocol}://${hostname}${portSuffix}`

  console.log(`🦍 Uploading ${shares.length} shared file(s)`)

  await Promise.all(shares.map(async ({ hash, data }) => {
    try {
      // For shared files, use upload pattern with hash as both queryId and pathHash
      const response = await fetch(`${baseUrl}/api/ape/data/_share/${hash}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: data
      })

      if (!response.ok) {
        throw new Error(`Shared upload failed: ${response.status}`)
      }
    } catch (err) {
      console.error(`🦍 Failed to upload shared file ${hash}:`, err)
      throw err
    }
  }))
}

/**
 * Upload binary data via HTTP PUT
 */
async function uploadBinaryData(queryId, uploads) {
  if (uploads.length === 0) return

  // Build base URL
  const hostname = window.location.hostname
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  const isHttps = window.location.protocol === "https:"
  const port = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const protocol = isHttps ? "https" : "http"
  const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ""
  const baseUrl = `${protocol}://${hostname}${portSuffix}`

  console.log(`🦍 Uploading ${uploads.length} binary file(s)`)

  await Promise.all(uploads.map(async ({ hash, data }) => {
    try {
      const response = await fetch(`${baseUrl}/api/ape/data/${queryId}/${hash}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: data
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }
    } catch (err) {
      console.error(`🦍 Failed to upload binary at ${hash}:`, err)
      throw err
    }
  }))
}

wsSend = function (type, data, createdAt, dirctCall) {
  let rej, promiseIsLive = false;
  const timeLetForReqToBeMade = (createdAt + totalRequestTimeout) - Date.now()

  const timer = setTimeout(() => {
    if (promiseIsLive) {
      rej(new Error("Request Timedout for :" + type))
    }
  }, timeLetForReqToBeMade);

  // Process binary data for upload
  const { processedData, uploads } = processBinaryForUpload(data)

  const payload = {
    type,
    data: processedData,
    //referer:window.location.href,
    createdAt: new Date(createdAt),
    requestedAt: dirctCall ? undefined
      : new Date()
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
    __socket.send(message);

    // Upload binary data after sending WS message
    if (uploads.length > 0) {
      uploadBinaryData(queryId, uploads).catch(err => {
        console.error('🦍 Binary upload failed:', err)
        // The server will timeout waiting for the upload
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
} // END wsSend


const sender = (type, data) => {
  if ("string" !== typeof type) {
    throw new Error("Missing Path vaule")
  }

  const createdAt = Date.now()

  if (ready) {
    return wsSend(type, data, createdAt, true)
  }

  const timeLetForReqToBeMade = (createdAt + connectTimeout) - Date.now() // 5sec for reconnect

  const timer = setTimeout(() => {
    const errMessage = "Request not sent for :" + type
    if (payload.waiting) {
      payload.reject(new Error(errMessage))
    } else {
      throw new Error(errMessage)
    }
  }, timeLetForReqToBeMade);

  const payload = { type, data, resolve: undefined, reject: undefined, waiting: false, createdAt, timer };
  const waitingOnOpen = new Promise((res, rej) => { payload.resolve = res; payload.reject = rej; })

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

  aWaitingSend.push(payload)
  if (!__socket) {
    connectSocket()
  }

  return waitingOnOpen
} // END sender

/**
 * Build the client interface object
 */
function buildClientInterface() {
  return {
    sender: wrap(sender),
    setOnReceiver: (onTypeStFn, handlerFn) => {
      if ("string" === typeof onTypeStFn) {
        // Replace handler for this type (prevents duplicates in React StrictMode)
        ofTypesOb[onTypeStFn] = [handlerFn]
      } else {
        // For general receivers, prevent duplicates by checking
        if (!receiverArray.includes(onTypeStFn)) {
          receiverArray.push(onTypeStFn)
        }
      }
    },
    onConnectionChange: (handler) => {
      connectionChangeListeners.push(handler)
      // Immediately call with current state
      handler(connectionState)
      // Return unsubscribe function
      return () => {
        const idx = connectionChangeListeners.indexOf(handler)
        if (idx > -1) connectionChangeListeners.splice(idx, 1)
      }
    },
    // Expose current transport type (read-only)
    get transport() { return currentTransport }
  }
}

connectSocket.autoReconnect = () => reconnect = true
connectSocket.ConnectionState = ConnectionState
connect = connectSocket

export default connect;
export { ConnectionState };
