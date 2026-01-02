/**
 * Extract root domain from a URL
 * e.g., "https://sub.example.com:3000/path" -> "example.com"
 */
module.exports = function extractRootDomain(url) {
    if (!url) return ''
    try {
        // Handle full URLs
        if (url.includes('://')) {
            const hostname = new URL(url).hostname
            const parts = hostname.split('.')
            return parts.length > 2 ? parts.slice(-2).join('.') : hostname
        }
        // Handle hostname:port format
        const hostname = url.split(':')[0]
        const parts = hostname.split('.')
        return parts.length > 2 ? parts.slice(-2).join('.') : hostname
    } catch {
        return url.split(':')[0]
    }
}
