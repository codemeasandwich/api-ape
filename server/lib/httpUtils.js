/**
 * Shared HTTP utilities for api-ape server
 * @module server/lib/httpUtils
 */

const path = require('path')
const fs = require('fs')

/**
 * Parse URL path parameters like /api/ape/data/:hash
 */
function matchRoute(pathname, pattern) {
    const patternParts = pattern.split('/')
    const pathParts = pathname.split('/')
    if (patternParts.length !== pathParts.length) return null
    const params = {}
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i]
        } else if (patternParts[i] !== pathParts[i]) {
            return null
        }
    }
    return params
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

function getCookie(headers, name) {
    const cookies = typeof headers.get === 'function' ? headers.get('cookie') : headers.cookie
    if (!cookies) return null
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? match[1] : null
}

function isLocalhost(host) {
    const hostname = host?.split(':')[0] || ''
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function isSecure(req) {
    if (typeof req.headers?.get === 'function') {
        return req.headers.get('x-forwarded-proto') === 'https'
    }
    return req.socket?.encrypted || req.headers?.['x-forwarded-proto'] === 'https'
}

function serveClientBundle(clientPath, res) {
    const filePath = path.join(__dirname, '../../dist/ape.js')
    fs.readFile(filePath, (err, data) => {
        if (err) {
            sendJson(res, 500, { error: 'Failed to read client bundle' })
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/javascript' })
        res.end(data)
    })
}

function serveSourceMap(res) {
    const filePath = path.join(__dirname, '../../dist/ape.js.map')
    fs.readFile(filePath, (err, data) => {
        if (err) {
            sendJson(res, 404, { error: 'Source map not found' })
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(data)
    })
}

module.exports = {
    matchRoute,
    sendJson,
    getCookie,
    isLocalhost,
    isSecure,
    serveClientBundle,
    serveSourceMap
}
