/**
 * FileTransferManager - Handles temporary binary data endpoints
 * @module server/lib/fileTransfer
 */

const { StreamingFileManager } = require('./fileTransfer/streaming')

const DEFAULT_START_TIMEOUT = 60 * 1000
const DEFAULT_COMPLETE_TIMEOUT = 60 * 1000

class FileTransferManager {
    constructor(options = {}) {
        this.startTimeout = options.startTimeout || DEFAULT_START_TIMEOUT
        this.completeTimeout = options.completeTimeout || DEFAULT_COMPLETE_TIMEOUT
        this.pendingDownloads = new Map()
        this.pendingUploads = new Map()
        this._streaming = new StreamingFileManager(this.startTimeout, this.completeTimeout)
        this._cleanupInterval = setInterval(() => this._cleanup(), 30000)
    }

    // Streaming file methods (delegate to StreamingFileManager)
    registerStreamingFile(fileId, uploaderId) {
        return this._streaming.register(fileId, uploaderId)
    }

    appendChunk(fileId, chunk) {
        return this._streaming.appendChunk(fileId, chunk)
    }

    completeStreamingUpload(fileId, data) {
        return this._streaming.complete(fileId, data)
    }

    getStreamingFile(fileId, offset = 0) {
        return this._streaming.get(fileId, offset)
    }

    isStreamingFile(fileId) {
        return this._streaming.has(fileId)
    }

    // Download handling
    registerDownload(hash, data, contentType, sessionHostId) {
        if (this.pendingDownloads.has(hash)) {
            const existing = this.pendingDownloads.get(hash)
            if (existing.timer) clearTimeout(existing.timer)
        }

        const entry = {
            data,
            contentType: contentType || 'application/octet-stream',
            sessionHostId,
            createdAt: Date.now(),
            downloadStarted: false,
            timer: setTimeout(() => {
                if (!this.pendingDownloads.get(hash)?.downloadStarted) {
                    this.pendingDownloads.delete(hash)
                }
            }, this.startTimeout)
        }

        this.pendingDownloads.set(hash, entry)
        return hash
    }

    getDownload(hash, requestingHostId) {
        const entry = this.pendingDownloads.get(hash)
        if (!entry) return null
        if (entry.sessionHostId !== requestingHostId) return null

        if (!entry.downloadStarted) {
            entry.downloadStarted = true
            clearTimeout(entry.timer)
            entry.timer = setTimeout(() => {
                this.pendingDownloads.delete(hash)
            }, this.completeTimeout)
        }

        return { data: entry.data, contentType: entry.contentType }
    }

    // Upload handling
    registerUpload(queryId, pathHash, sessionHostId) {
        const key = `${queryId}/${pathHash}`
        return new Promise((resolve, reject) => {
            const entry = {
                sessionHostId,
                createdAt: Date.now(),
                resolver: resolve,
                rejector: reject,
                data: null,
                timer: setTimeout(() => {
                    this.pendingUploads.delete(key)
                    reject(new Error(`Upload timeout: ${key}`))
                }, this.startTimeout)
            }
            this.pendingUploads.set(key, entry)
        })
    }

    receiveUpload(queryId, pathHash, data, requestingHostId) {
        const key = `${queryId}/${pathHash}`
        const entry = this.pendingUploads.get(key)
        if (!entry) return false
        if (entry.sessionHostId !== requestingHostId) return false

        clearTimeout(entry.timer)
        entry.resolver(data)
        this.pendingUploads.delete(key)
        return true
    }

    static generateHash(queryId, propertyPath) {
        const combined = `${queryId}:${propertyPath}`
        let hash = 0
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return Math.abs(hash).toString(36)
    }

    _cleanup() {
        const now = Date.now()
        const maxAge = this.startTimeout + this.completeTimeout

        for (const [hash, entry] of this.pendingDownloads) {
            if (now - entry.createdAt > maxAge) {
                clearTimeout(entry.timer)
                this.pendingDownloads.delete(hash)
            }
        }

        for (const [key, entry] of this.pendingUploads) {
            if (now - entry.createdAt > maxAge) {
                clearTimeout(entry.timer)
                entry.rejector(new Error(`Upload expired: ${key}`))
                this.pendingUploads.delete(key)
            }
        }

        this._streaming.cleanup(maxAge)
    }

    destroy() {
        clearInterval(this._cleanupInterval)
        for (const entry of this.pendingDownloads.values()) clearTimeout(entry.timer)
        for (const entry of this.pendingUploads.values()) clearTimeout(entry.timer)
        this.pendingDownloads.clear()
        this.pendingUploads.clear()
        this._streaming.destroy()
    }
}

let instance = null

function getFileTransferManager(options) {
    if (!instance) instance = new FileTransferManager(options)
    return instance
}

module.exports = { FileTransferManager, getFileTransferManager }
