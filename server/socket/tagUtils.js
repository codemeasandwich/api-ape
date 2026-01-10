/**
 * Upload tag utilities for socket receive handler
 * @module server/socket/tagUtils
 */

function findUploadTags(obj, path = '') {
    const uploads = []
    if (obj === null || obj === undefined || typeof obj !== 'object') return uploads

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            uploads.push(...findUploadTags(obj[i], path ? `${path}.${i}` : String(i)))
        }
        return uploads
    }

    for (const key of Object.keys(obj)) {
        const bMatch = key.match(/^(.+)<!B>$/)
        const aMatch = key.match(/^(.+)<!A>$/)
        if (bMatch) {
            uploads.push({ path: path ? `${path}.${bMatch[1]}` : bMatch[1], hash: obj[key], tag: 'B', originalKey: key })
        } else if (aMatch) {
            uploads.push({ path: path ? `${path}.${aMatch[1]}` : aMatch[1], hash: obj[key], tag: 'A', originalKey: key })
        } else {
            uploads.push(...findUploadTags(obj[key], path ? `${path}.${key}` : key))
        }
    }
    return uploads
}

function findFileTags(obj, path = '') {
    const files = []
    if (obj === null || obj === undefined || typeof obj !== 'object') return files

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            files.push(...findFileTags(obj[i], path ? `${path}.${i}` : String(i)))
        }
        return files
    }

    for (const key of Object.keys(obj)) {
        const fMatch = key.match(/^(.+)<!F>$/)
        if (fMatch) {
            files.push({ path: path ? `${path}.${fMatch[1]}` : fMatch[1], hash: obj[key], originalKey: key })
        } else {
            files.push(...findFileTags(obj[key], path ? `${path}.${key}` : key))
        }
    }
    return files
}

function cleanUploadTags(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(cleanUploadTags)

    const cleaned = {}
    for (const key of Object.keys(obj)) {
        const bMatch = key.match(/^(.+)<!B>$/)
        const aMatch = key.match(/^(.+)<!A>$/)
        if (bMatch) cleaned[bMatch[1]] = obj[key]
        else if (aMatch) cleaned[aMatch[1]] = obj[key]
        else cleaned[key] = cleanUploadTags(obj[key])
    }
    return cleaned
}

function setValueAtPath(obj, path, value) {
    const parts = path.split('.')
    let current = obj
    for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]]
    current[parts[parts.length - 1]] = value
}

module.exports = { findUploadTags, findFileTags, cleanUploadTags, setValueAtPath }
