import messageHash from '../utils/messageHash'
import jss from '../utils/jss'


let connect;

// Configuration
let configuredPort = null
let configuredHost = null

/**
 * Configure api-ape client connection
 * @param {object} opts
 * @param {number} [opts.port] - WebSocket port (default: 9010 for local, 443/80 for remote)
 * @param {string} [opts.host] - WebSocket host (default: auto-detect from window.location)
 */
function configure(opts = {}) {
  if (opts.port) configuredPort = opts.port
  if (opts.host) configuredHost = opts.host
}

/**
 * Get WebSocket URL - auto-detects from window.location, keeps /api/ape path
 */
function getSocketUrl() {
  const hostname = configuredHost || window.location.hostname
  const localServers = ["localhost", "127.0.0.1", "[::1]"]
  const isLocal = localServers.includes(hostname)
  const isHttps = window.location.protocol === "https:"

  // Default port: 9010 for local dev, otherwise use window.location.port or implicit 443/80
  const defaultPort = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
  const port = configuredPort || defaultPort

  // Build URL - keep /api/ape path
  const protocol = isHttps ? "wss" : "ws"
  const portSuffix = (isLocal || port !== 80 && port !== 443) ? `:${port}` : ""

  return `${protocol}://${hostname}${portSuffix}/api/ape`
}

let reconnect = false
const connentTimeout = 5000
const totalRequestTimeout = 10000
//const location = window.location

const joinKey = "/"
// Properties accessed directly on `ape` that should NOT be intercepted
const reservedKeys = new Set(['on'])
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
const reciverOn = [];

let aWaitingSend = []
const reciverOnAr = [];
const ofTypesOb = {};

function connectSocket() {

  if (!__socket) {
    __socket = new WebSocket(getSocketUrl())

    __socket.onopen = event => {
      //console.log('socket connected()');
      ready = true;
      aWaitingSend.forEach(({ type, data, next, err, waiting, createdAt, timer }) => {
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
          cleaned[cleanKey] = obj[key] // Value will be replaced after fetch
        } else {
          cleaned[key] = cleanLinkedKeys(obj[key])
        }
      }
      return cleaned
    }

    /**
     * Fetch binary resources and hydrate data object
     */
    async function fetchLinkedResources(data, hostId) {
      const resources = findLinkedResources(data)

      if (resources.length === 0) {
        return data
      }

      console.log(`🦍 Fetching ${resources.length} binary resource(s)`)

      // Clean the data first (remove <!L> suffixes from keys)
      const cleanedData = cleanLinkedKeys(data)

      // Build base URL for fetches
      const hostname = configuredHost || window.location.hostname
      const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
      const isHttps = window.location.protocol === "https:"
      const defaultPort = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
      const port = configuredPort || defaultPort
      const protocol = isHttps ? "https" : "http"
      const portSuffix = (isLocal || (port !== 80 && port !== 443)) ? `:${port}` : ""
      const baseUrl = `${protocol}://${hostname}${portSuffix}`

      // Fetch all resources in parallel
      await Promise.all(resources.map(async ({ path, hash }) => {
        try {
          const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
            credentials: 'include',
            headers: {
              'X-Ape-Host-Id': hostId || ''
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

    __socket.onmessage = async function (event) {
      //console.log('WebSocket message:', event);
      const { err, type, queryId, data } = jss.parse(event.data)

      // Messages with queryId must fulfill matching promise
      if (queryId) {
        if (waitingOn[queryId]) {
          // Check for linked resources and fetch them before resolving
          if (data && !err) {
            try {
              const hydratedData = await fetchLinkedResources(data)
              waitingOn[queryId](err, hydratedData)
            } catch (fetchErr) {
              waitingOn[queryId](fetchErr, null)
            }
          } else {
            waitingOn[queryId](err, data)
          }
          delete waitingOn[queryId]
        } else {
          // No matching promise - error and ignore
          console.error(`🦍 No matching queryId: ${queryId}`)
        }
        return
      }

      // Only messages WITHOUT queryId go to setOnReciver
      // Also hydrate broadcast messages
      let processedData = data
      if (data && !err) {
        try {
          processedData = await fetchLinkedResources(data)
        } catch (fetchErr) {
          console.error(`🦍 Failed to hydrate broadcast data:`, fetchErr)
        }
      }

      if (ofTypesOb[type]) {
        ofTypesOb[type].forEach(worker => worker({ err, type, data: processedData }))
      } // if ofTypesOb[type]
      reciverOnAr.forEach(worker => worker({ err, type, data: processedData }))

    } // END onmessage

    __socket.onerror = function (err) {
      console.error('socket ERROR:', err);
    } // END onerror

    __socket.onclose = function (event) {
      console.warn('socket disconnect:', event);
      __socket = false
      ready = false;
      setTimeout(() => reconnect && connectSocket(), 500);
    } // END onclose

  } // END if ! __socket

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
   * Upload binary data via HTTP PUT
   */
  async function uploadBinaryData(queryId, uploads) {
    if (uploads.length === 0) return

    // Build base URL
    const hostname = configuredHost || window.location.hostname
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    const isHttps = window.location.protocol === "https:"
    const defaultPort = isLocal ? 9010 : (window.location.port || (isHttps ? 443 : 80))
    const port = configuredPort || defaultPort
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

    const timeLetForReqToBeMade = (createdAt + connentTimeout) - Date.now() // 5sec for reconnent

    const timer = setTimeout(() => {
      const errMessage = "Request not sent for :" + type
      if (payload.waiting) {
        payload.err(new Error(errMessage))
      } else {
        throw new Error(errMessage)
      }
    }, timeLetForReqToBeMade);

    const payload = { type, data, next: undefined, err: undefined, waiting: false, createdAt, timer };
    const waitingOnOpen = new Promise((res, er) => { payload.next = res; payload.err = er; })

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

  return {
    sender: wrap(sender),
    setOnReciver: (onTypeStFn, handlerFn) => {
      if ("string" === typeof onTypeStFn) {
        // Replace handler for this type (prevents duplicates in React StrictMode)
        ofTypesOb[onTypeStFn] = [handlerFn]
      } else {
        // For general receivers, prevent duplicates by checking
        if (!reciverOnAr.includes(onTypeStFn)) {
          reciverOnAr.push(onTypeStFn)
        }
      }
    } // END setOnReciver
  } // END return
} // END connectSocket

connectSocket.autoReconnect = () => reconnect = true
connectSocket.configure = configure
connect = connectSocket

export default connect;
export { configure };
