/**
 * @fileoverview Root Domain Extraction Utility
 *
 * This module provides a utility function to extract the root domain from a URL
 * or hostname. This is useful for security checks like CORS origin validation,
 * where you need to compare domains regardless of subdomains or ports.
 *
 * The function handles various input formats:
 * - Full URLs: `https://sub.example.com:3000/path` → `example.com`
 * - Hostnames with port: `api.example.com:8080` → `example.com`
 * - Simple hostnames: `www.example.com` → `example.com`
 * - Already root domains: `example.com` → `example.com`
 *
 * @module server/security/extractRootDomain
 * @see {@link module:server/security/origin} - Origin security validation
 *
 * @example
 * const extractRootDomain = require('./extractRootDomain')
 *
 * // Full URL with subdomain and port
 * extractRootDomain('https://api.example.com:3000/v1/users')
 * // Returns: 'example.com'
 *
 * // Hostname with subdomain
 * extractRootDomain('www.mysite.org')
 * // Returns: 'mysite.org'
 *
 * // Already a root domain
 * extractRootDomain('example.com')
 * // Returns: 'example.com'
 */

/**
 * Extracts the root domain from a URL or hostname.
 *
 * The root domain is the registrable domain (e.g., `example.com`) without
 * any subdomains (e.g., `www`, `api`, `staging`).
 *
 * Algorithm:
 * 1. If input contains `://`, parse as full URL and extract hostname
 * 2. Otherwise, treat as hostname and remove port if present
 * 3. Split hostname by `.` and take the last two segments
 *
 * **Limitations**:
 * - Does not handle multi-part TLDs like `.co.uk` or `.com.au`
 *   (e.g., `api.example.co.uk` → `co.uk` instead of `example.co.uk`)
 * - For production use with international domains, consider using
 *   a proper public suffix list library
 *
 * @function extractRootDomain
 * @param {string} url - Full URL or hostname to extract root domain from
 * @returns {string} The root domain, or empty string if input is falsy
 *
 * @example
 * // Full URL with subdomain
 * extractRootDomain('https://sub.example.com:3000/path')
 * // Returns: 'example.com'
 *
 * @example
 * // Hostname with port
 * extractRootDomain('api.example.com:8080')
 * // Returns: 'example.com'
 *
 * @example
 * // Simple subdomain
 * extractRootDomain('www.example.com')
 * // Returns: 'example.com'
 *
 * @example
 * // Already root domain
 * extractRootDomain('example.com')
 * // Returns: 'example.com'
 *
 * @example
 * // Two-part domain
 * extractRootDomain('localhost')
 * // Returns: 'localhost'
 *
 * @example
 * // Null/undefined input
 * extractRootDomain(null)
 * // Returns: ''
 *
 * @example
 * // Invalid URL falls back gracefully
 * extractRootDomain('not-a-valid-url')
 * // Returns: 'not-a-valid-url'
 */
module.exports = function extractRootDomain(url) {
  // Handle null/undefined/empty input
  if (!url) return "";

  try {
    // Check if this is a full URL (has protocol)
    if (url.includes("://")) {
      // Parse as URL to extract hostname
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");

      // If more than 2 parts (e.g., sub.example.com), take last 2
      // Otherwise return as-is (e.g., example.com or localhost)
      return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
    }

    // Handle hostname:port format (no protocol)
    // Remove port by splitting on ':' and taking first part
    const hostname = url.split(":")[0];
    const parts = hostname.split(".");

    // Same logic: take last 2 parts if more than 2
    return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
  } catch {
    // If URL parsing fails, try to extract hostname from raw string
    // This handles malformed URLs gracefully
    return url.split(":")[0];
  }
};
