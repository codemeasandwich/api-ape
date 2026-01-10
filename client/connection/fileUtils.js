/**
 * Common utilities for file handling
 * @module client/connection/fileUtils
 */

/**
 * Check if value is binary data (ArrayBuffer, typed array, or Blob)
 */
export function isBinaryData(value) {
    if (value === null || value === undefined) return false
    return value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value) ||
        (typeof Blob !== 'undefined' && value instanceof Blob)
}

/**
 * Get binary type tag (A for ArrayBuffer, B for Blob)
 */
export function getBinaryTag(value) {
    if (typeof Blob !== 'undefined' && value instanceof Blob) return 'B'
    return 'A'
}

/**
 * Generate a simple hash for binary upload path identification
 */
export function generateUploadHash(path) {
    let hash = 0
    for (let i = 0; i < path.length; i++) {
        const char = path.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(36)
}

/**
 * Set a value at a nested dot-notation path in an object
 */
export function setValueAtPath(obj, path, value) {
    const parts = path.split('.')
    let current = obj
    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]]
    }
    current[parts[parts.length - 1]] = value
}

/**
 * Find tagged properties in data (L, F, B, or A tags)
 */
export function findTaggedProps(obj, tag, path = '') {
    const results = []
    if (obj === null || obj === undefined || typeof obj !== 'object') return results

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            results.push(...findTaggedProps(obj[i], tag, path ? `${path}.${i}` : String(i)))
        }
        return results
    }

    const suffix = `<!${tag}>`
    for (const key of Object.keys(obj)) {
        if (key.endsWith(suffix)) {
            const cleanKey = key.slice(0, -4)
            results.push({
                path: path ? `${path}.${cleanKey}` : cleanKey,
                hash: obj[key],
                originalKey: key
            })
        } else {
            results.push(...findTaggedProps(obj[key], tag, path ? `${path}.${key}` : key))
        }
    }
    return results
}

/**
 * Clean tagged keys from object (rename key<!X> to key)
 */
export function cleanTaggedKeys(obj, tag) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj

    if (Array.isArray(obj)) {
        return obj.map(item => cleanTaggedKeys(item, tag))
    }

    const cleaned = {}
    const suffix = `<!${tag}>`
    for (const key of Object.keys(obj)) {
        if (key.endsWith(suffix)) {
            cleaned[key.slice(0, -4)] = obj[key]
        } else {
            cleaned[key] = cleanTaggedKeys(obj[key], tag)
        }
    }
    return cleaned
}
