/**
 * Streaming file handler - client-to-client transfers
 * @module server/lib/fileTransfer/streaming
 */

class StreamingFileManager {
    constructor(startTimeout, completeTimeout) {
        this.startTimeout = startTimeout
        this.completeTimeout = completeTimeout
        this.streamingFiles = new Map()
    }

    register(fileId, uploaderId) {
        if (this.streamingFiles.has(fileId)) {
            const existing = this.streamingFiles.get(fileId)
            if (existing.timer) clearTimeout(existing.timer)
        }

        const entry = {
            uploaderId,
            chunks: [],
            totalReceived: 0,
            isComplete: false,
            createdAt: Date.now(),
            timer: setTimeout(() => {
                this.streamingFiles.delete(fileId)
            }, this.startTimeout + this.completeTimeout)
        }

        this.streamingFiles.set(fileId, entry)
        return fileId
    }

    appendChunk(fileId, chunk) {
        const entry = this.streamingFiles.get(fileId)
        if (!entry) return false
        entry.chunks.push(chunk)
        entry.totalReceived += chunk.length
        return true
    }

    complete(fileId, data) {
        const entry = this.streamingFiles.get(fileId)
        if (!entry) return false

        if (data) {
            entry.chunks = [data]
            entry.totalReceived = data.length
        }
        entry.isComplete = true

        clearTimeout(entry.timer)
        entry.timer = setTimeout(() => {
            this.streamingFiles.delete(fileId)
        }, this.completeTimeout)

        return true
    }

    get(fileId, offset = 0) {
        const entry = this.streamingFiles.get(fileId)
        if (!entry) return null

        const data = Buffer.concat(entry.chunks)
        return {
            data: offset > 0 ? data.slice(offset) : data,
            isComplete: entry.isComplete,
            totalReceived: entry.totalReceived
        }
    }

    has(fileId) {
        return this.streamingFiles.has(fileId)
    }

    cleanup(maxAge) {
        const now = Date.now()
        for (const [fileId, entry] of this.streamingFiles) {
            if (now - entry.createdAt > maxAge) {
                clearTimeout(entry.timer)
                this.streamingFiles.delete(fileId)
            }
        }
    }

    destroy() {
        for (const entry of this.streamingFiles.values()) {
            clearTimeout(entry.timer)
        }
        this.streamingFiles.clear()
    }
}

module.exports = { StreamingFileManager }
