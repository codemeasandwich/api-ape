/**
 * FileTransferManager - Handles temporary binary data endpoints
 * 
 * For downloads (server → client):
 * - Registers binary data with a hash
 * - Creates temporary endpoint at GET /api/ape/data/:hash
 * - Verifies session before allowing download
 * - Auto-cleanup after timeout
 * 
 * For uploads (client → server):
 * - Registers upload expectation with queryId + pathHash
 * - Receives data via PUT /api/ape/data/:queryId/:pathHash
 * - Waits for matching WS message before processing
 */

// Default timeouts (configurable)
const DEFAULT_START_TIMEOUT = 60 * 1000  // 1 minute to start download
const DEFAULT_COMPLETE_TIMEOUT = 60 * 1000  // 1 minute after download starts

class FileTransferManager {
    constructor(options = {}) {
        this.startTimeout = options.startTimeout || DEFAULT_START_TIMEOUT
        this.completeTimeout = options.completeTimeout || DEFAULT_COMPLETE_TIMEOUT

        // Map<hash, { data, contentType, sessionHostId, createdAt, downloadStarted, timer }>
        this.pendingDownloads = new Map()

        // Map<`${queryId}/${pathHash}`, { sessionHostId, createdAt, resolver, rejector, timer, data }>
        this.pendingUploads = new Map()

        // Cleanup interval
        this._cleanupInterval = setInterval(() => this._cleanup(), 30000)
    }

    /**
     * Register a binary download
     * @param {string} hash - Unique hash for this download
     * @param {Buffer|ArrayBuffer} data - Binary data to serve
     * @param {string} contentType - MIME type (e.g., 'application/octet-stream')
     * @param {string} sessionHostId - Host ID of the client session
     * @returns {string} The hash (for confirmation)
     */
    registerDownload(hash, data, contentType, sessionHostId) {
        // Clear any existing entry with same hash
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
                // Auto-remove if download never started
                if (!this.pendingDownloads.get(hash)?.downloadStarted) {
                    this.pendingDownloads.delete(hash)
                    console.log(`📦 Download expired (never started): ${hash}`)
                }
            }, this.startTimeout)
        }

        this.pendingDownloads.set(hash, entry)
        console.log(`📦 Registered download: ${hash} for session ${sessionHostId}`)
        return hash
    }

    /**
     * Get download data (called by HTTP handler)
     * @param {string} hash - Download hash
     * @param {string} requestingHostId - Host ID of requester (from session/cookie)
     * @returns {{ data: Buffer, contentType: string } | null}
     */
    getDownload(hash, requestingHostId) {
        const entry = this.pendingDownloads.get(hash)

        if (!entry) {
            console.warn(`📦 Download not found: ${hash}`)
            return null
        }

        // Session verification
        if (entry.sessionHostId !== requestingHostId) {
            console.warn(`📦 Session mismatch for ${hash}: expected ${entry.sessionHostId}, got ${requestingHostId}`)
            return null
        }

        // Mark download as started
        if (!entry.downloadStarted) {
            entry.downloadStarted = true
            clearTimeout(entry.timer)

            // Set new timer for cleanup after completion
            entry.timer = setTimeout(() => {
                this.pendingDownloads.delete(hash)
                console.log(`📦 Download cleaned up: ${hash}`)
            }, this.completeTimeout)
        }

        return {
            data: entry.data,
            contentType: entry.contentType
        }
    }

    /**
     * Register an expected upload
     * @param {string} queryId - Query ID from WS message
     * @param {string} pathHash - Hash of property path
     * @param {string} sessionHostId - Host ID of the client session
     * @returns {Promise<Buffer>} Resolves when upload is received
     */
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
            console.log(`📤 Registered upload expectation: ${key} for session ${sessionHostId}`)
        })
    }

    /**
     * Receive upload data (called by HTTP handler)
     * @param {string} queryId - Query ID from URL
     * @param {string} pathHash - Path hash from URL
     * @param {Buffer} data - Uploaded binary data
     * @param {string} requestingHostId - Host ID of uploader
     * @returns {boolean} True if accepted
     */
    receiveUpload(queryId, pathHash, data, requestingHostId) {
        const key = `${queryId}/${pathHash}`
        const entry = this.pendingUploads.get(key)

        if (!entry) {
            console.warn(`📤 Upload not expected: ${key}`)
            return false
        }

        // Session verification
        if (entry.sessionHostId !== requestingHostId) {
            console.warn(`📤 Session mismatch for upload ${key}: expected ${entry.sessionHostId}, got ${requestingHostId}`)
            return false
        }

        // Clear timeout and resolve
        clearTimeout(entry.timer)
        entry.resolver(data)
        this.pendingUploads.delete(key)
        console.log(`📤 Upload received: ${key}`)

        return true
    }

    /**
     * Generate hash for download from queryId and property path
     * @param {string} queryId - The query ID
     * @param {string} propertyPath - The property path (e.g., 'files.0.data')
     * @returns {string} Combined hash
     */
    static generateHash(queryId, propertyPath) {
        // Simple hash combining queryId and path
        // In production, could use crypto.createHash
        const combined = `${queryId}:${propertyPath}`
        let hash = 0
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36)
    }

    /**
     * Cleanup expired entries
     * @private
     */
    _cleanup() {
        const now = Date.now()
        const maxAge = this.startTimeout + this.completeTimeout

        // Cleanup downloads
        for (const [hash, entry] of this.pendingDownloads) {
            if (now - entry.createdAt > maxAge) {
                clearTimeout(entry.timer)
                this.pendingDownloads.delete(hash)
                console.log(`📦 Cleanup stale download: ${hash}`)
            }
        }

        // Cleanup uploads
        for (const [key, entry] of this.pendingUploads) {
            if (now - entry.createdAt > maxAge) {
                clearTimeout(entry.timer)
                entry.rejector(new Error(`Upload expired: ${key}`))
                this.pendingUploads.delete(key)
                console.log(`📤 Cleanup stale upload: ${key}`)
            }
        }
    }

    /**
     * Shutdown cleanup
     */
    destroy() {
        clearInterval(this._cleanupInterval)

        // Clear all timers
        for (const entry of this.pendingDownloads.values()) {
            clearTimeout(entry.timer)
        }
        for (const entry of this.pendingUploads.values()) {
            clearTimeout(entry.timer)
        }

        this.pendingDownloads.clear()
        this.pendingUploads.clear()
    }
}

// Singleton instance
let instance = null

function getFileTransferManager(options) {
    if (!instance) {
        instance = new FileTransferManager(options)
    }
    return instance
}

module.exports = {
    FileTransferManager,
    getFileTransferManager
}
