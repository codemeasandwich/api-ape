// Type definitions for `api-ape/messageHash`

/**
 * The `queryId` of a call: Jenkins one-at-a-time hash of the exact message text, in
 * Crockford Base32. The server answers a call on this id.
 */
declare function messageHash(message: string): string
export = messageHash
