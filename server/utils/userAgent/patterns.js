/**
 * @fileoverview User-Agent Pattern Definitions for Parsing
 *
 * This module contains all the regular expression patterns and lookup tables
 * used by the parseUserAgent function to identify browsers, operating systems,
 * devices, CPU architectures, and bots from User-Agent strings.
 *
 * ## Pattern Organization
 *
 * Patterns are organized into categories:
 * - **BROWSERS**: Browser identification patterns (ordered by priority)
 * - **OS_PATTERNS**: Operating system detection with version mapping
 * - **ENGINES**: Rendering engine patterns (Blink, Gecko, WebKit, etc.)
 * - **DEVICE_PATTERNS**: Device type detection (mobile, tablet, console, etc.)
 * - **DEVICE_VENDORS**: Device manufacturer identification
 * - **CPU_PATTERNS**: CPU architecture detection
 * - **BOT_PATTERNS**: Bot/crawler identification
 * - **MODEL_PATTERNS**: Specific device model extraction
 *
 * ## Pattern Priority
 *
 * Browser patterns are ordered from most specific to least specific.
 * This ensures that specialized browsers (like ChatGPT-User, Edge, Opera)
 * are detected before falling back to generic patterns (Chrome, Firefox).
 *
 * ## Adding New Patterns
 *
 * When adding new patterns:
 * 1. Add more specific patterns before more general ones
 * 2. Use non-capturing groups `(?:...)` when possible for performance
 * 3. Include version capture groups `([\d.]*)` where appropriate
 * 4. Test against real User-Agent strings
 *
 * @module server/utils/userAgent/patterns
 * @see {@link module:server/utils/parseUserAgent} - Parser using these patterns
 *
 * @example
 * const { BROWSERS, BOT_PATTERNS } = require('./patterns')
 *
 * // Check if UA is a bot
 * const ua = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
 * const isBot = BOT_PATTERNS.some(pattern => pattern.test(ua))
 * console.log(isBot)  // true
 *
 * // Find browser match
 * for (const { name, pattern } of BROWSERS) {
 *     const match = ua.match(pattern)
 *     if (match) {
 *         console.log(name, match[1])  // 'Googlebot', '2.1'
 *         break
 *     }
 * }
 */

/**
 * @typedef {Object} BrowserPattern
 * Pattern definition for browser detection.
 *
 * @property {string} name - Display name of the browser
 * @property {RegExp} pattern - Regex pattern with optional version capture group
 */

/**
 * @typedef {Object} OSPattern
 * Pattern definition for operating system detection.
 *
 * @property {string} name - Display name of the OS
 * @property {RegExp} pattern - Regex pattern with optional version capture group
 * @property {string} [versionSep] - Character to replace in version strings (e.g., '_' → '.')
 * @property {Object.<string, string>} [versionMap] - Map of internal versions to display versions
 */

/**
 * @typedef {Object} EnginePattern
 * Pattern definition for rendering engine detection.
 *
 * @property {string} name - Display name of the engine
 * @property {RegExp} pattern - Regex pattern with version capture group
 */

/**
 * @typedef {Object} DeviceTypePattern
 * Pattern definition for device type detection.
 *
 * @property {string} type - Device type (mobile, tablet, console, smarttv, wearable, embedded)
 * @property {RegExp} pattern - Regex pattern to match device indicators
 */

/**
 * @typedef {Object} DeviceVendorPattern
 * Pattern definition for device manufacturer detection.
 *
 * @property {string} vendor - Manufacturer name
 * @property {RegExp} pattern - Regex pattern to match vendor indicators
 */

/**
 * @typedef {Object} CPUPattern
 * Pattern definition for CPU architecture detection.
 *
 * @property {string} architecture - CPU architecture name (arm64, arm, amd64, ia32)
 * @property {RegExp} pattern - Regex pattern to match architecture indicators
 */

/**
 * @typedef {Object} ModelPattern
 * Pattern definition for device model extraction.
 *
 * @property {RegExp} pattern - Regex pattern with capture groups for model info
 * @property {function(RegExpMatchArray): string} extract - Function to extract model name from match
 */

/**
 * Browser detection patterns ordered by priority (most specific first).
 *
 * The order matters! More specific browsers (like Edge, Opera, Brave) include
 * "Chrome" in their UA string, so they must be checked before the generic
 * Chrome pattern.
 *
 * ## Pattern Groups
 *
 * 1. **AI Bots**: ChatGPT, Claude, Perplexity, Google-Extended
 * 2. **Search Crawlers**: Googlebot, Bingbot, YandexBot, DuckDuckBot, etc.
 * 3. **CLI Tools**: curl, wget
 * 4. **Headless Browsers**: HeadlessChrome, PhantomJS, Puppeteer, Playwright
 * 5. **Social Media In-App**: Facebook, Instagram, Twitter, TikTok, etc.
 * 6. **Alternative Browsers**: Edge, Opera, Brave, Vivaldi, Samsung, UC, etc.
 * 7. **Major Browsers**: Chrome, Firefox, Safari, IE
 *
 * @type {BrowserPattern[]}
 *
 * @example
 * // Match Chrome browser
 * const ua = 'Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36'
 * for (const { name, pattern } of BROWSERS) {
 *     const match = ua.match(pattern)
 *     if (match) {
 *         console.log(name)     // 'Chrome'
 *         console.log(match[1]) // '120.0.0.0'
 *         break
 *     }
 * }
 */
const BROWSERS = [
  // AI Bots - check first as they're becoming common
  { name: "ChatGPT-User", pattern: /ChatGPT-User\/?([\d.]*)/i },
  { name: "GPTBot", pattern: /GPTBot\/?([\d.]*)/i },
  { name: "OAI-SearchBot", pattern: /OAI-SearchBot\/?([\d.]*)/i },
  { name: "ClaudeBot", pattern: /ClaudeBot\/?([\d.]*)/i },
  { name: "Claude-User", pattern: /Claude-User\/?([\d.]*)/i },
  { name: "Claude-SearchBot", pattern: /Claude-SearchBot\/?([\d.]*)/i },
  { name: "Claude-Web", pattern: /Claude-Web\/?([\d.]*)/i },
  { name: "PerplexityBot", pattern: /PerplexityBot\/?([\d.]*)/i },
  { name: "Perplexity-User", pattern: /Perplexity-User\/?([\d.]*)/i },
  { name: "Google-Extended", pattern: /Google-Extended/i },

  // Traditional search engine crawlers
  { name: "Googlebot", pattern: /Googlebot\/?([\d.]*)/i },
  { name: "Bingbot", pattern: /bingbot\/?([\d.]*)/i },
  { name: "YandexBot", pattern: /YandexBot\/?([\d.]*)/i },
  { name: "DuckDuckBot", pattern: /DuckDuckBot\/?([\d.]*)/i },
  { name: "Slurp", pattern: /Slurp/i },
  { name: "Baiduspider", pattern: /Baiduspider\/?([\d.]*)/i },

  // CLI tools and libraries
  { name: "curl", pattern: /curl\/?([\d.]*)/i },
  { name: "wget", pattern: /Wget\/?([\d.]*)/i },

  // Headless browsers and automation tools
  { name: "HeadlessChrome", pattern: /HeadlessChrome\/?([\d.]*)/i },
  { name: "PhantomJS", pattern: /PhantomJS\/?([\d.]*)/i },
  { name: "Puppeteer", pattern: /Puppeteer/i },
  { name: "Playwright", pattern: /Playwright/i },

  // Social media in-app browsers
  { name: "Facebook", pattern: /\bFB[\w_]*\/?([\d.]*)/i },
  { name: "Instagram", pattern: /Instagram\s?([\d.]*)/i },
  { name: "Twitter", pattern: /Twitter/i },
  { name: "TikTok", pattern: /TikTok/i },
  { name: "Snapchat", pattern: /Snapchat/i },
  { name: "LinkedIn", pattern: /LinkedInApp/i },
  { name: "Pinterest", pattern: /Pinterest/i },
  { name: "WhatsApp", pattern: /WhatsApp\/?([\d.]*)/i },
  { name: "Telegram", pattern: /TelegramBot/i },

  // Alternative browsers (must come before Chrome/Firefox)
  { name: "Edge", pattern: /Edg(?:e|A|iOS)?\/?([\d.]*)/i },
  { name: "Opera", pattern: /(?:OPR|Opera)\/?([\d.]*)/i },
  { name: "Brave", pattern: /Brave\/?([\d.]*)/i },
  { name: "Vivaldi", pattern: /Vivaldi\/?([\d.]*)/i },
  { name: "Yandex", pattern: /YaBrowser\/?([\d.]*)/i },
  { name: "Samsung Internet", pattern: /SamsungBrowser\/?([\d.]*)/i },
  { name: "UC Browser", pattern: /UCBrowser\/?([\d.]*)/i },
  { name: "QQ Browser", pattern: /QQBrowser\/?([\d.]*)/i },
  { name: "Whale", pattern: /Whale\/?([\d.]*)/i },

  // Major browsers (generic patterns last)
  { name: "Chrome", pattern: /(?:Chrome|CriOS)\/?([\d.]*)/i },
  { name: "Firefox", pattern: /(?:Firefox|FxiOS)\/?([\d.]*)/i },
  { name: "Safari", pattern: /Version\/([\d.]*)\s.*Safari/i },
  { name: "IE", pattern: /(?:MSIE\s|Trident.*rv:)([\d.]*)/i },
];

/**
 * Operating system detection patterns with version normalization.
 *
 * Some patterns include:
 * - **versionSep**: Character to replace with '.' in version strings
 *   (e.g., iOS uses '_' like "17_0" → "17.0")
 * - **versionMap**: Mapping from internal versions to display versions
 *   (e.g., Windows NT "10.0" → "10", "6.1" → "7")
 *
 * @type {OSPattern[]}
 *
 * @example
 * // Detect iOS
 * const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...'
 * for (const { name, pattern, versionSep } of OS_PATTERNS) {
 *     const match = ua.match(pattern)
 *     if (match) {
 *         let version = match[1]
 *         if (versionSep) version = version.replace(/_/g, '.')
 *         console.log(name, version)  // 'iOS', '17.0'
 *         break
 *     }
 * }
 */
const OS_PATTERNS = [
  // Mobile operating systems
  {
    name: "iOS",
    pattern: /(?:iPhone|iPad|iPod).*?OS\s([\d_]+)/i,
    versionSep: "_",
  },
  { name: "Android", pattern: /(?<!like\s)Android\s?([\d.]*)/i },

  // Desktop operating systems
  { name: "macOS", pattern: /Mac OS X\s?([\d_\.]*)/i, versionSep: "_" },
  {
    name: "Windows",
    pattern: /Windows NT\s?([\d.]*)/i,
    versionMap: {
      "10.0": "10",
      6.3: "8.1",
      6.2: "8",
      6.1: "7",
      "6.0": "Vista",
      5.1: "XP",
    },
  },

  // Chrome OS and Linux variants
  { name: "Chrome OS", pattern: /CrOS\s\w+\s([\d.]*)/i },
  { name: "Ubuntu", pattern: /Ubuntu/i },
  { name: "Fedora", pattern: /Fedora/i },
  { name: "FreeBSD", pattern: /FreeBSD/i },
  { name: "Linux", pattern: /Linux/i },
];

/**
 * Browser rendering engine patterns.
 *
 * Engine detection helps understand browser capabilities:
 * - **Blink**: Chrome, Edge, Opera, Brave (modern Chromium-based)
 * - **Gecko**: Firefox
 * - **WebKit**: Safari, iOS browsers
 * - **Trident**: Internet Explorer
 * - **EdgeHTML**: Legacy Edge (pre-Chromium)
 * - **Presto**: Legacy Opera
 *
 * @type {EnginePattern[]}
 *
 * @example
 * const ua = 'Mozilla/5.0 ... AppleWebKit/537.36 ... Chrome/120.0.0.0'
 * for (const { name, pattern } of ENGINES) {
 *     const match = ua.match(pattern)
 *     if (match) {
 *         console.log(name)  // 'Blink' (Chrome uses Blink)
 *         break
 *     }
 * }
 */
const ENGINES = [
  { name: "Blink", pattern: /Chrome\/([\d.]+)/i },
  { name: "Gecko", pattern: /Gecko\/([\d.]+)/i },
  { name: "WebKit", pattern: /AppleWebKit\/([\d.]+)/i },
  { name: "Trident", pattern: /Trident\/([\d.]+)/i },
  { name: "EdgeHTML", pattern: /Edge\/([\d.]+)/i },
  { name: "Presto", pattern: /Presto\/([\d.]+)/i },
];

/**
 * Device type detection patterns.
 *
 * Detects general device categories:
 * - **console**: Gaming consoles (PlayStation, Xbox, Nintendo)
 * - **tablet**: Tablets (iPad, Android tablets, PlayBook)
 * - **mobile**: Phones and small mobile devices
 * - **smarttv**: Smart TVs and streaming devices
 * - **wearable**: Smartwatches and fitness trackers
 * - **embedded**: Embedded devices
 *
 * Order matters: Tablet is checked before mobile because some tablet
 * UAs also contain "Mobile" in certain contexts.
 *
 * @type {DeviceTypePattern[]}
 *
 * @example
 * const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)...'
 * for (const { type, pattern } of DEVICE_PATTERNS) {
 *     if (pattern.test(ua)) {
 *         console.log(type)  // 'tablet'
 *         break
 *     }
 * }
 */
const DEVICE_PATTERNS = [
  { type: "console", pattern: /PlayStation|Xbox|Nintendo/i },
  { type: "tablet", pattern: /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i },
  {
    type: "mobile",
    pattern:
      /Mobile|Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Opera Mobi/i,
  },
  {
    type: "smarttv",
    pattern:
      /SmartTV|Smart-TV|GoogleTV|AppleTV|BRAVIA|WebOS|Tizen|HbbTV|NetCast/i,
  },
  { type: "wearable", pattern: /Watch|Fitbit/i },
  { type: "embedded", pattern: /Embedded/i },
];

/**
 * Device vendor (manufacturer) detection patterns.
 *
 * Identifies the device manufacturer based on common identifiers
 * in User-Agent strings. Patterns check for:
 * - Brand names (Apple, Samsung, Huawei)
 * - Model prefixes (SM- for Samsung, Pixel for Google)
 * - Product identifiers (SGP for Sony tablets)
 *
 * @type {DeviceVendorPattern[]}
 *
 * @example
 * const ua = '... SM-G998B Build/...'  // Samsung Galaxy S21 Ultra
 * for (const { vendor, pattern } of DEVICE_VENDORS) {
 *     if (pattern.test(ua)) {
 *         console.log(vendor)  // 'Samsung'
 *         break
 *     }
 * }
 */
const DEVICE_VENDORS = [
  { vendor: "Apple", pattern: /iPhone|iPad|iPod|Macintosh|AppleTV/i },
  { vendor: "Samsung", pattern: /Samsung|SM-|GT-/i },
  { vendor: "Huawei", pattern: /Huawei|HUAWEI/i },
  {
    vendor: "Xiaomi",
    pattern:
      /Xiaomi|Mi\s|Redmi|\b\d{5}[A-Z]{2}\d{2}[A-Z]\b|\bM\d{4}[A-Z]\d{2}[A-Z]{2}\b/i,
  },
  { vendor: "Google", pattern: /Pixel|Nexus/i },
  { vendor: "OnePlus", pattern: /OnePlus|ONEPLUS/i },
  { vendor: "LG", pattern: /LG[-;\/\s]/i },
  { vendor: "Sony", pattern: /Sony|Xperia|PlayStation|\bSGP\d+\b/i },
  { vendor: "Motorola", pattern: /Motorola|Moto\s|\bmoto\s/i },
  { vendor: "HTC", pattern: /HTC/i },
  { vendor: "Nokia", pattern: /Nokia/i },
  { vendor: "Oppo", pattern: /OPPO/i },
  { vendor: "Vivo", pattern: /vivo/i },
  { vendor: "Realme", pattern: /RMX\d/i },
  { vendor: "Microsoft", pattern: /Xbox|Surface|Microsoft;/i },
  { vendor: "Nintendo", pattern: /Nintendo/i },
];

/**
 * CPU architecture detection patterns.
 *
 * Identifies processor architecture for compatibility checking:
 * - **arm64**: 64-bit ARM (Apple Silicon, modern mobile, ARM servers)
 * - **arm**: 32-bit ARM (older mobile devices)
 * - **amd64**: 64-bit x86 (modern desktops/laptops)
 * - **ia32**: 32-bit x86 (legacy systems)
 *
 * @type {CPUPattern[]}
 *
 * @example
 * const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...'
 * for (const { architecture, pattern } of CPU_PATTERNS) {
 *     if (pattern.test(ua)) {
 *         console.log(architecture)  // 'amd64'
 *         break
 *     }
 * }
 */
const CPU_PATTERNS = [
  { architecture: "arm64", pattern: /aarch64|arm64/i },
  { architecture: "arm", pattern: /arm(?!64)/i },
  { architecture: "amd64", pattern: /x64|x86_64|amd64|Win64|WOW64/i },
  { architecture: "ia32", pattern: /x86|i[36]86/i },
];

/**
 * Bot detection patterns.
 *
 * Comprehensive patterns to identify automated clients:
 * - AI bots (ChatGPT, Claude, Perplexity, Google-Extended)
 * - Generic bot indicators (bot, crawl, spider, search, fetch)
 * - Search engine crawlers (Googlebot, Bingbot, etc.)
 * - HTTP libraries (curl, wget, python, axios, etc.)
 * - Headless browsers and automation tools
 *
 * These patterns cast a wide net and may have false positives.
 * Use `isBot` as a hint, not absolute determination.
 *
 * @type {RegExp[]}
 *
 * @example
 * const ua = 'curl/7.79.1'
 * const isBot = BOT_PATTERNS.some(pattern => pattern.test(ua))
 * console.log(isBot)  // true
 *
 * @example
 * // Block bots from certain endpoints
 * if (BOT_PATTERNS.some(p => p.test(req.headers['user-agent']))) {
 *     return res.status(403).send('Bots not allowed')
 * }
 */
const BOT_PATTERNS = [
  // AI bots and assistants
  /ChatGPT|GPTBot|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Google-Extended/i,

  // Generic bot indicators
  /bot|crawl|spider|slurp|search|fetch|monitor|check|scan/i,

  // Known search engine crawlers
  /Googlebot|Bingbot|YandexBot|DuckDuckBot|Baiduspider|Sogou|Exabot|facebot|ia_archiver/i,

  // HTTP libraries and CLI tools
  /curl|wget|python|java|perl|ruby|php|http|node|axios|got\//i,

  // Headless browsers and automation
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|WebDriver/i,
];

/**
 * Device model extraction patterns.
 *
 * Each pattern includes an extract function to normalize the model name
 * from the regex match. Patterns are ordered from most specific to
 * most generic.
 *
 * - Apple devices: Extract iPhone/iPad/iPod from identifier
 * - Samsung: Extract SM-* or GT-* model codes
 * - Google: Extract Pixel model names
 * - Generic: Extract model from "Build/" marker
 *
 * @type {ModelPattern[]}
 *
 * @example
 * const ua = '... Pixel 8 Pro Build/...'
 * for (const { pattern, extract } of MODEL_PATTERNS) {
 *     const match = ua.match(pattern)
 *     if (match) {
 *         console.log(extract(match))  // 'Pixel 8 Pro'
 *         break
 *     }
 * }
 */
const MODEL_PATTERNS = [
  // Apple device identifiers (iPad12,1 → iPad)
  {
    pattern: /(iPad\d+,\d+|iPhone\d+,\d+|iPod\d+,\d+)/,
    extract: (m) => m[1].replace(/\d+,\d+/, ""),
  },

  // Apple device names
  { pattern: /(iPhone|iPad|iPod)[\s;]/, extract: (m) => m[1] },

  // Samsung model codes (SM-G998B, GT-I9100)
  { pattern: /(SM-[A-Z0-9]+|GT-[A-Z0-9]+)/i, extract: (m) => m[1] },

  // Google Pixel devices
  {
    pattern: /(Pixel[\s]?\d*[a-z]?\s?(?:Pro|XL)?)/i,
    extract: (m) => m[1].trim(),
  },

  // Google Nexus devices
  { pattern: /(Nexus\s?\d+[a-z]?)/i, extract: (m) => m[1] },

  // Generic Android model extraction (before "Build/")
  { pattern: /;\s*([^;)]+)\s*Build\//i, extract: (m) => m[1].trim() },
];

module.exports = {
  /**
   * Browser detection patterns (ordered by priority).
   * @type {BrowserPattern[]}
   */
  BROWSERS,

  /**
   * Operating system detection patterns.
   * @type {OSPattern[]}
   */
  OS_PATTERNS,

  /**
   * Rendering engine detection patterns.
   * @type {EnginePattern[]}
   */
  ENGINES,

  /**
   * Device type detection patterns.
   * @type {DeviceTypePattern[]}
   */
  DEVICE_PATTERNS,

  /**
   * Device vendor/manufacturer patterns.
   * @type {DeviceVendorPattern[]}
   */
  DEVICE_VENDORS,

  /**
   * CPU architecture detection patterns.
   * @type {CPUPattern[]}
   */
  CPU_PATTERNS,

  /**
   * Bot/crawler detection patterns.
   * @type {RegExp[]}
   */
  BOT_PATTERNS,

  /**
   * Device model extraction patterns.
   * @type {ModelPattern[]}
   */
  MODEL_PATTERNS,
};
