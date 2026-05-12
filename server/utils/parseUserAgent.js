/**
 * @fileoverview Robust User-Agent Parser - Zero Dependencies
 *
 * This module provides a comprehensive User-Agent string parser that extracts
 * detailed information about the client's browser, operating system, device,
 * CPU architecture, and bot status. It has zero external dependencies and
 * handles a wide variety of user agents including:
 *
 * - Modern browsers (Chrome, Firefox, Safari, Edge, Opera, Brave, etc.)
 * - Mobile browsers (iOS Safari, Chrome Mobile, Samsung Internet, etc.)
 * - AI bots (ChatGPT, Claude, GPTBot, Perplexity, etc.)
 * - Traditional crawlers (Googlebot, Bingbot, etc.)
 * - Headless browsers (HeadlessChrome, PhantomJS, Puppeteer, etc.)
 * - In-app browsers (Facebook, Instagram, WhatsApp, etc.)
 * - Game consoles (PlayStation, Xbox, Nintendo)
 * - Smart TVs and set-top boxes
 *
 * The parser is designed to be:
 * - **Fast**: Simple regex matching with early termination
 * - **Accurate**: Handles edge cases and common variations
 * - **Safe**: Returns null values instead of throwing errors
 * - **Comprehensive**: Extracts browser, engine, OS, device, and CPU info
 *
 * @module server/utils/parseUserAgent
 * @see {@link module:server/utils/userAgent/patterns} - Pattern definitions
 *
 * @example
 * const parseUserAgent = require('./parseUserAgent')
 *
 * const result = parseUserAgent(
 *     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
 *     '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
 * )
 *
 * console.log(result)
 * // {
 * //   browser: { name: 'Chrome', version: '120.0.0.0', major: '120' },
 * //   engine: { name: 'Blink', version: '120.0.0.0' },
 * //   os: { name: 'Windows', version: '10' },
 * //   device: { type: null, vendor: null, model: null },
 * //   cpu: { architecture: 'amd64' },
 * //   isBot: false,
 * //   raw: '...'
 * // }
 *
 * @example
 * // Detect AI bots
 * const result = parseUserAgent('ClaudeBot/1.0')
 * console.log(result.browser.name) // 'ClaudeBot'
 * console.log(result.isBot)        // true
 *
 * @example
 * // Handle mobile devices
 * const result = parseUserAgent(
 *     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ...'
 * )
 * console.log(result.device.type)   // 'mobile'
 * console.log(result.device.vendor) // 'Apple'
 * console.log(result.os.name)       // 'iOS'
 */

const {
  BROWSERS,
  OS_PATTERNS,
  ENGINES,
  DEVICE_PATTERNS,
  DEVICE_VENDORS,
  CPU_PATTERNS,
  BOT_PATTERNS,
  MODEL_PATTERNS,
} = require("./userAgent/patterns");

/**
 * @typedef {Object} BrowserInfo
 * Information about the detected browser.
 *
 * @property {string|null} name - Browser name (e.g., 'Chrome', 'Firefox', 'Safari')
 * @property {string|null} version - Full version string (e.g., '120.0.0.0')
 * @property {string|null} major - Major version number (e.g., '120')
 */

/**
 * @typedef {Object} EngineInfo
 * Information about the browser's rendering engine.
 *
 * @property {string|null} name - Engine name (e.g., 'Blink', 'Gecko', 'WebKit')
 * @property {string|null} version - Engine version string
 */

/**
 * @typedef {Object} OSInfo
 * Information about the operating system.
 *
 * @property {string|null} name - OS name (e.g., 'Windows', 'macOS', 'iOS', 'Android')
 * @property {string|null} version - OS version (e.g., '10', '14.0', '17.0')
 */

/**
 * @typedef {Object} DeviceInfo
 * Information about the device.
 *
 * @property {string|null} type - Device type: 'mobile', 'tablet', 'console', 'smarttv', 'wearable', 'embedded', or null for desktop
 * @property {string|null} vendor - Device manufacturer (e.g., 'Apple', 'Samsung', 'Google')
 * @property {string|null} model - Device model (e.g., 'iPhone', 'Pixel 8 Pro', 'SM-G998B')
 */

/**
 * @typedef {Object} CPUInfo
 * Information about the CPU architecture.
 *
 * @property {string|null} architecture - CPU architecture: 'arm64', 'arm', 'amd64', 'ia32', or null
 */

/**
 * @typedef {Object} ParsedUserAgent
 * Complete result from parsing a User-Agent string.
 *
 * @property {BrowserInfo} browser - Browser information
 * @property {EngineInfo} engine - Rendering engine information
 * @property {OSInfo} os - Operating system information
 * @property {DeviceInfo} device - Device information
 * @property {CPUInfo} cpu - CPU architecture information
 * @property {boolean} isBot - True if the user agent appears to be a bot/crawler
 * @property {string|null} raw - The original User-Agent string
 */

/**
 * Creates an empty result object with all null values.
 *
 * Used as the default return value and as a base for building results.
 *
 * @private
 * @function createEmptyResult
 * @param {string|null} ua - The original User-Agent string to store in `raw`
 * @returns {ParsedUserAgent} Empty result object with all null values
 */
function createEmptyResult(ua) {
  return {
    browser: { name: null, version: null, major: null },
    engine: { name: null, version: null },
    os: { name: null, version: null },
    device: { type: null, vendor: null, model: null },
    cpu: { architecture: null },
    isBot: false,
    raw: ua || null,
  };
}

/**
 * Parses a User-Agent string and extracts detailed client information.
 *
 * This function analyzes the User-Agent string to determine:
 * - **Browser**: Name, version, and major version number
 * - **Engine**: Rendering engine (Blink, Gecko, WebKit, etc.)
 * - **OS**: Operating system name and version
 * - **Device**: Type (mobile/tablet/etc.), vendor, and model
 * - **CPU**: Architecture (arm64, amd64, etc.)
 * - **Bot status**: Whether this appears to be an automated client
 *
 * The parser handles many edge cases:
 * - Safari detection when Chrome isn't present
 * - Version number normalization (e.g., Windows NT versions)
 * - Multiple bot detection patterns (AI bots, crawlers, headless browsers)
 *
 * @function parseUserAgent
 * @param {string|null|undefined} ua - The User-Agent string to parse
 * @returns {ParsedUserAgent} Parsed information about the client
 *
 * @example
 * // Parse a Chrome user agent
 * const result = parseUserAgent(
 *     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
 *     'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
 * )
 *
 * console.log(result.browser.name)    // 'Chrome'
 * console.log(result.browser.major)   // '120'
 * console.log(result.os.name)         // 'macOS'
 * console.log(result.os.version)      // '10.15.7'
 * console.log(result.device.type)     // null (desktop)
 * console.log(result.isBot)           // false
 *
 * @example
 * // Parse a mobile Safari user agent
 * const result = parseUserAgent(
 *     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
 *     'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
 * )
 *
 * console.log(result.browser.name)    // 'Safari'
 * console.log(result.os.name)         // 'iOS'
 * console.log(result.device.type)     // 'mobile'
 * console.log(result.device.vendor)   // 'Apple'
 * console.log(result.device.model)    // 'iPhone'
 *
 * @example
 * // Detect an AI bot
 * const result = parseUserAgent('ChatGPT-User')
 *
 * console.log(result.browser.name)    // 'ChatGPT-User'
 * console.log(result.isBot)           // true
 *
 * @example
 * // Handle null/undefined input
 * const result = parseUserAgent(null)
 *
 * console.log(result.browser.name)    // null
 * console.log(result.raw)             // null
 *
 * @example
 * // Use in request handler
 * app.use((req, res, next) => {
 *     req.userAgent = parseUserAgent(req.headers['user-agent'])
 *
 *     // Block bots from certain endpoints
 *     if (req.userAgent.isBot && req.path.startsWith('/api/')) {
 *         return res.status(403).json({ error: 'Bots not allowed' })
 *     }
 *
 *     // Serve mobile-optimized content
 *     if (req.userAgent.device.type === 'mobile') {
 *         req.isMobile = true
 *     }
 *
 *     next()
 * })
 */
function parseUserAgent(ua) {
  // Handle null, undefined, or non-string input
  if (ua == null || typeof ua !== "string") {
    return createEmptyResult(ua);
  }

  const result = createEmptyResult(ua);
  result.raw = ua;

  // =========================================================================
  // BROWSER DETECTION
  // =========================================================================
  // Try each browser pattern in priority order (most specific first)
  for (const { name, pattern } of BROWSERS) {
    const match = ua.match(pattern);
    if (match) {
      result.browser.name = name;
      result.browser.version = match[1] || null;
      result.browser.major = match[1] ? match[1].split(".")[0] : null;
      break;
    }
  }

  // Special case: Safari detection when Chrome isn't present
  // Many browsers include "Safari" in their UA, but real Safari doesn't have "Chrome"
  if (!result.browser.name && /Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    result.browser.name = "Safari";
    const m = ua.match(/Safari\/([\d.]+)/i);
    result.browser.version = m ? m[1] : null;
    result.browser.major = result.browser.version
      ? result.browser.version.split(".")[0]
      : null;
  }

  // =========================================================================
  // ENGINE DETECTION
  // =========================================================================
  for (const { name, pattern } of ENGINES) {
    const match = ua.match(pattern);
    if (match) {
      result.engine.name = name;
      // DEAD `|| null`: every ENGINE pattern includes a required `([\d.]+)`
      // capture group, so match[1] is always truthy. To be removed at step 7.
      result.engine.version = match[1] /* || null */;
      break;
    }
  }

  // =========================================================================
  // OS DETECTION
  // =========================================================================
  for (const { name, pattern, versionSep, versionMap } of OS_PATTERNS) {
    const match = ua.match(pattern);
    if (match) {
      result.os.name = name;
      let version = match[1] || null;

      // Replace version separator (e.g., "_" with "." for iOS/macOS)
      if (version && versionSep) {
        version = version.replace(new RegExp(versionSep, "g"), ".");
      }

      // Map version numbers (e.g., "6.1" to "7" for Windows)
      if (version && versionMap && versionMap[version]) {
        version = versionMap[version];
      }

      result.os.version = version;
      break;
    }
  }

  // =========================================================================
  // DEVICE TYPE DETECTION
  // =========================================================================
  for (const { type, pattern } of DEVICE_PATTERNS) {
    if (pattern.test(ua)) {
      result.device.type = type;
      break;
    }
  }

  // =========================================================================
  // DEVICE VENDOR DETECTION
  // =========================================================================
  for (const { vendor, pattern } of DEVICE_VENDORS) {
    if (pattern.test(ua)) {
      result.device.vendor = vendor;
      break;
    }
  }

  // =========================================================================
  // DEVICE MODEL DETECTION
  // =========================================================================
  for (const { pattern, extract } of MODEL_PATTERNS) {
    const match = ua.match(pattern);
    if (match) {
      result.device.model = extract(match);
      break;
    }
  }

  // =========================================================================
  // CPU ARCHITECTURE DETECTION
  // =========================================================================
  for (const { architecture, pattern } of CPU_PATTERNS) {
    if (pattern.test(ua)) {
      result.cpu.architecture = architecture;
      break;
    }
  }

  // =========================================================================
  // BOT DETECTION
  // =========================================================================
  // Check all bot patterns - any match indicates a bot
  result.isBot = BOT_PATTERNS.some((pattern) => pattern.test(ua));

  return result;
}

module.exports = parseUserAgent;
