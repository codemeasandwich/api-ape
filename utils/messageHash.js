/**
 * Message hashing utilities for api-ape
 * Uses Jenkins one-at-a-time hash with base32 encoding
 * 
 * @module utils/messageHash
 */

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * Convert a number to base32 string using Crockford alphabet
 * @param {number} n - Number to convert
 * @returns {string} Base32 encoded string
 */
function toBase32(n) {
    const remainder = Math.floor(n / 32)
    const current = n % 32
    if (0 === remainder) {
        return alphabet[current]
    }
    return toBase32(remainder) + alphabet[current]
} // END toBase32

/**
 * Jenkins one-at-a-time hash function
 * @param {string} keyString - String to hash
 * @returns {number} 32-bit unsigned hash value
 */
function jenkinsOneAtATimeHash(keyString) {

    var hash = 0

    for (var charIndex = 0; charIndex < keyString.length; ++charIndex) {
        hash += keyString.charCodeAt(charIndex);
        hash += hash << 10;
        hash ^= hash >> 6;
    }
    hash += hash << 3;
    hash ^= hash >> 11;
    //4,294,967,295 is FFFFFFFF, the maximum 32 bit unsigned integer value, used here as a mask.
    return (((hash + (hash << 15)) & 4294967295) >>> 0)
} // END jenkinsOneAtATimeHash

/**
 * Generate a base32 hash from a message string
 * @param {string} messageSt - Message to hash
 * @returns {string} Base32 encoded hash
 */
function messageHash(messageSt) {
    return toBase32(jenkinsOneAtATimeHash(messageSt))
} // END messageHash

module.exports = messageHash