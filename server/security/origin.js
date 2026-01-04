const extractRootDomain = require('./extractRootDomain')

// Helper to get header that works with both Express and raw Node http
function getHeader(req, name) {
  // Express-style
  if (typeof req.header === 'function') {
    return req.header(name)
  }
  // Raw Node.js http request
  return req.headers[name.toLowerCase()]
}

module.exports = function (socket, req, onError) {
  onError = onError || console.error
  const origin = extractRootDomain(getHeader(req, 'Origin') || "")
  const host = extractRootDomain(getHeader(req, 'Host'))
  if (origin && origin !== host) {
    onError("REJECTING socket from " + getHeader(req, 'Origin') + " miss-match with " + getHeader(req, 'Host'))
    if (socket && socket.destroy) {
      socket.destroy()
    }
    return false
  }
  return true
}