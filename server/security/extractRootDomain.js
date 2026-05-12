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
 * **Country Code TLD Handling**:
 * - Handles common ccTLDs like `.co.uk`, `.com.au`, `.me.uk`
 * - Detection: If TLD is 2 chars AND SLD is a known pattern (co, com, net, org, me, ac, gov)
 * - Example: `api.example.co.uk` → `example.co.uk` (not `co.uk`)
 *
 * **Limitations**:
 * - For complex cases (e.g., `.pvt.k12.ma.us`), consider using
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
// Common second-level domains used with country code TLDs
const CCTLD_SLDS = new Set(["co", "com", "net", "org", "me", "ac", "gov", "edu"]);

/**
 * Check if a domain uses a country code TLD pattern
 * @param {string[]} parts - Domain parts split by '.'
 * @returns {boolean} True if this looks like a ccTLD domain
 * @private
 */
function isCcTLD(parts) {
  // DEAD: every caller (extractRootDomain) only invokes isCcTLD when
  // `parts.length > 2`, so the `< 3` guard is unreachable. To be removed
  // at step 7.
  // if (parts.length < 3) return false;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  // TLD must be 2 chars (country code) AND SLD is a known pattern
  return tld.length === 2 && CCTLD_SLDS.has(sld.toLowerCase());
}

module.exports = function extractRootDomain(url) {
  // Handle null/undefined/empty input
  if (!url) return "";

  try {
    // Check if this is a full URL (has protocol)
    if (url.includes("://")) {
      // Parse as URL to extract hostname
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");

      if (parts.length > 2) {
        // Check for country code TLD (e.g., .co.uk, .com.au, .me.uk)
        if (isCcTLD(parts)) {
          // Include the third-level domain for ccTLDs
          return parts.slice(-3).join(".");
        }
        return parts.slice(-2).join(".");
      }
      return hostname;
    }

    // Handle hostname:port format (no protocol)
    // Remove port by splitting on ':' and taking first part
    const hostname = url.split(":")[0];
    const parts = hostname.split(".");

    if (parts.length > 2) {
      // Check for country code TLD (e.g., .co.uk, .com.au, .me.uk)
      if (isCcTLD(parts)) {
        return parts.slice(-3).join(".");
      }
      return parts.slice(-2).join(".");
    }
    return hostname;
  } catch {
    // If URL parsing fails, try to extract hostname from raw string
    // This handles malformed URLs gracefully
    return url.split(":")[0];
  }
};
