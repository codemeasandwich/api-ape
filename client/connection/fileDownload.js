/**
 * Binary file download/fetch utilities
 * @module client/connection/fileDownload
 */

import { getBaseUrl } from './network'
import { setValueAtPath, findTaggedProps, cleanTaggedKeys } from './fileUtils'

/**
 * Fetch binary resources from server and hydrate data object
 */
export async function fetchLinkedResources(data, clientId) {
    const resources = findTaggedProps(data, 'L')
    if (resources.length === 0) return data

    console.log(`🦍 Fetching ${resources.length} binary resource(s)`)
    const cleanedData = cleanTaggedKeys(data, 'L')
    const baseUrl = getBaseUrl()

    await Promise.all(resources.map(async ({ path, hash }) => {
        try {
            const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
                credentials: 'include',
                headers: { 'X-Ape-Client-Id': clientId || '' }
            })
            if (!response.ok) throw new Error(`Failed: ${response.status}`)
            const arrayBuffer = await response.arrayBuffer()
            setValueAtPath(cleanedData, path, arrayBuffer)
        } catch (err) {
            console.error(`🦍 Failed to fetch binary resource at ${path}:`, err)
            setValueAtPath(cleanedData, path, null)
        }
    }))

    return cleanedData
}

/**
 * Fetch shared files (client-to-client transfers) with retry logic
 */
export async function fetchSharedFiles(data, maxRetries = 5) {
    const files = findTaggedProps(data, 'F')
    if (files.length === 0) return data

    console.log(`🦍 Fetching ${files.length} shared file(s)`)
    const cleanedData = cleanTaggedKeys(data, 'F')
    const baseUrl = getBaseUrl()

    await Promise.all(files.map(async ({ path, hash }) => {
        let retries = 0
        let backoff = 100

        while (retries < maxRetries) {
            try {
                const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
                    credentials: 'include'
                })

                if (!response.ok) {
                    if (response.status === 404 && retries < maxRetries - 1) {
                        retries++
                        await new Promise(r => setTimeout(r, backoff))
                        backoff *= 2
                        continue
                    }
                    throw new Error(`Failed to fetch shared file: ${response.status}`)
                }

                setValueAtPath(cleanedData, path, await response.arrayBuffer())
                break
            } catch (err) {
                if (retries >= maxRetries - 1) {
                    console.error(`🦍 Failed to fetch shared file at ${path}:`, err)
                    setValueAtPath(cleanedData, path, null)
                }
                retries++
                await new Promise(r => setTimeout(r, backoff))
                backoff *= 2
            }
        }
    }))

    return cleanedData
}
