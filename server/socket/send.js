const jss = require('../../utils/jss')
const { FileTransferManager } = require('../lib/fileTransfer')

function checkSocketState(socket) {
  if (socket.readyState !== socket.OPEN) {
    switch (socket.readyState) {
      case socket.CONNECTING:
        throw "The connection is not yet open"
        break;
      case socket.CLOSING:
        throw "The connection is in theprocess of closing."
        break;
      case socket.CLOSED:
        throw "The connection is closed or couldn't be opened."
        break;
    } // END switch 
    //TODO: remove this socket if closed
  } // END if
} // END checkSocketState

/**
 * Check if value is binary data (Buffer, ArrayBuffer, or typed array)
 */
function isBinaryData(value) {
  if (value === null || value === undefined) return false
  return Buffer.isBuffer(value) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
}

/**
 * Detect content type from binary data
 */
function detectContentType(data) {
  // Could be enhanced with magic number detection
  return 'application/octet-stream'
}

/**
 * Process data object, replacing binary values with L-tagged hashes
 * Returns { processedData, binaryEntries }
 */
function processBinaryData(data, queryId, fileTransfer, clientId, path = '') {
  if (data === null || data === undefined) {
    return { processedData: data, binaryEntries: [] }
  }

  if (isBinaryData(data)) {
    // This is binary data - register and return hash
    const hash = FileTransferManager.generateHash(queryId, path || 'root')
    const contentType = detectContentType(data)
    fileTransfer.registerDownload(hash, data, contentType, clientId)

    return {
      processedData: { [`__ape_link__`]: hash },
      binaryEntries: [{ path, hash }]
    }
  }

  if (Array.isArray(data)) {
    const processedArray = []
    const allBinaryEntries = []

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i)
      const { processedData, binaryEntries } = processBinaryData(
        data[i], queryId, fileTransfer, clientId, itemPath
      )
      processedArray.push(processedData)
      allBinaryEntries.push(...binaryEntries)
    }

    return { processedData: processedArray, binaryEntries: allBinaryEntries }
  }

  if (typeof data === 'object') {
    const processedObj = {}
    const allBinaryEntries = []

    for (const key of Object.keys(data)) {
      const itemPath = path ? `${path}.${key}` : key
      const { processedData, binaryEntries } = processBinaryData(
        data[key], queryId, fileTransfer, clientId, itemPath
      )

      // If this was binary data, mark the key with <!L> tag
      if (binaryEntries.length > 0 && processedData?.__ape_link__) {
        processedObj[`${key}<!L>`] = processedData.__ape_link__
      } else {
        processedObj[key] = processedData
      }
      allBinaryEntries.push(...binaryEntries)
    }

    return { processedData: processedObj, binaryEntries: allBinaryEntries }
  }

  // Primitive value - return as-is
  return { processedData: data, binaryEntries: [] }
}

module.exports = function sendHandler({ socket, events, clientId, fileTransfer }) {

  return function send(queryId, type, data, err) {
    if (!type && !queryId) {
      throw new Error("You must pass a type OR a queryId in-order to send messages")
    }
    if (!data && !err) {
      throw new Error("You must pass a data payload OR an error message in-order to send messages")
    }
    let onFinish = false
    if (!queryId) { // dont call onSend as this will be past of the onReceive Flow
      onFinish = events.onSend(data, type)
    }

    try {
      checkSocketState(socket)
    } catch (err) {
      if (onFinish) {
        onFinish(err, false)
      } else if (queryId) {
        throw err
      } else {
        console.error(err)
      }
      return;
    }

    // Process binary data if fileTransfer is available
    let processedData = data
    if (fileTransfer && data && !err) {
      const { processedData: processed, binaryEntries } = processBinaryData(
        data, queryId || type, fileTransfer, clientId
      )
      processedData = processed
      if (binaryEntries.length > 0) {
        console.log(`📦 Registered ${binaryEntries.length} binary download(s) for ${queryId || type}`)
      }
    }

    if (err) {
      socket.send(jss.stringify({ err: err.message || err, type, queryId }))
      if (typeof onFinish === 'function') onFinish(err, true)
    } else {
      socket.send(jss.stringify({ data: processedData, type, queryId }))
      if (typeof onFinish === 'function') onFinish(false, data)
    }

  } // END send
} //sendHandler