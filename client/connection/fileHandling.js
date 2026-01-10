/**
 * Binary file upload utilities
 * @module client/connection/fileHandling
 */

import { getBaseUrl } from './network'
import { isBinaryData, getBinaryTag, generateUploadHash } from './fileUtils'

/**
 * Find and extract binary data from payload for upload
 */
export function processBinaryForUpload(data, path = '') {
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
 */
export function processBinaryForSharing(data, path = '') {
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
 * Upload binary data via HTTP PUT
 */
export async function uploadBinaryData(queryId, uploads) {
    if (uploads.length === 0) return
    const baseUrl = getBaseUrl()

    await Promise.all(uploads.map(async ({ hash, data }) => {
        const response = await fetch(`${baseUrl}/api/ape/data/${queryId}/${hash}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data
        })
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
    }))
}

/**
 * Upload shared files via HTTP PUT for client-to-client transfer
 */
export async function uploadSharedFiles(shares) {
    if (shares.length === 0) return
    const baseUrl = getBaseUrl()

    await Promise.all(shares.map(async ({ hash, data }) => {
        const response = await fetch(`${baseUrl}/api/ape/data/_share/${hash}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data
        })
        if (!response.ok) throw new Error(`Shared upload failed: ${response.status}`)
    }))
}

// Re-export setValueAtPath for fileDownload
export { setValueAtPath } from './fileUtils'
