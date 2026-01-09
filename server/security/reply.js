/**
 * Reply security for api-ape
 * Prevents replay attacks by tracking request IDs and validating timestamps
 * @module server/security/reply
 */

/**
 * Create a reply checker function that prevents duplicate/old requests
 * @returns {function} Check function (queryId, createdAt) => void
 */
module.exports = function () {
  /** @type {Array<[string, number]>} */
  let requestCheck = []

  /**
   * Check if request is valid (not a replay, not too old/future)
   * @param {string} queryId - Unique request identifier
   * @param {number} createdAt - Request creation timestamp
   * @throws {Error} If request is invalid (replay, too old, or future-dated)
   */
  return (queryId, createdAt) => {
    const startTime = Date.now();
    if (createdAt > startTime) {
      throw new Error("createdAt ahead of server by `${(createdAt - startTime) / 1000}secs. +${msg}`")
    }
    const tenSecAgo = startTime - 10000
    if (createdAt < tenSecAgo) {
      throw new Error("request is old by `${(startTime - createdAt) / 1000}secs. +${msg}`")
    }

    requestCheck = requestCheck.filter(([passQueryId, createdWhen]) => {
      if (passQueryId === queryId) {
        throw new Error(`Reply: ${queryId} ${msg}`)
      }
      return createdWhen > tenSecAgo
    })
    requestCheck.push([queryId, createdAt])
  }
}
