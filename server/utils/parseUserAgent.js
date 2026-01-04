/**
 * Robust User-Agent Parser
 * Zero-dependency replacement for ua-parser-js
 * Handles browsers, OS, devices, bots (including AI), and edge cases
 */

// Browser detection patterns - ORDER MATTERS (specific before generic)
const BROWSERS = [
    // AI Bots first (most specific)
    { name: 'ChatGPT-User', pattern: /ChatGPT-User\/?([\d.]*)/i },
    { name: 'GPTBot', pattern: /GPTBot\/?([\d.]*)/i },
    { name: 'OAI-SearchBot', pattern: /OAI-SearchBot\/?([\d.]*)/i },
    { name: 'ClaudeBot', pattern: /ClaudeBot\/?([\d.]*)/i },
    { name: 'Claude-User', pattern: /Claude-User\/?([\d.]*)/i },
    { name: 'Claude-SearchBot', pattern: /Claude-SearchBot\/?([\d.]*)/i },
    { name: 'Claude-Web', pattern: /Claude-Web\/?([\d.]*)/i },
    { name: 'PerplexityBot', pattern: /PerplexityBot\/?([\d.]*)/i },
    { name: 'Perplexity-User', pattern: /Perplexity-User\/?([\d.]*)/i },
    { name: 'Google-Extended', pattern: /Google-Extended/i },

    // Traditional bots
    { name: 'Googlebot', pattern: /Googlebot\/?([\d.]*)/i },
    { name: 'Bingbot', pattern: /bingbot\/?([\d.]*)/i },
    { name: 'YandexBot', pattern: /YandexBot\/?([\d.]*)/i },
    { name: 'DuckDuckBot', pattern: /DuckDuckBot\/?([\d.]*)/i },
    { name: 'Slurp', pattern: /Slurp/i },
    { name: 'Baiduspider', pattern: /Baiduspider\/?([\d.]*)/i },
    { name: 'curl', pattern: /curl\/?([\d.]*)/i },
    { name: 'wget', pattern: /Wget\/?([\d.]*)/i },
    { name: 'HeadlessChrome', pattern: /HeadlessChrome\/?([\d.]*)/i },
    { name: 'PhantomJS', pattern: /PhantomJS\/?([\d.]*)/i },
    { name: 'Puppeteer', pattern: /Puppeteer/i },
    { name: 'Playwright', pattern: /Playwright/i },

    // WebViews / In-app browsers (before generic browsers)
    { name: 'Facebook', pattern: /\bFB[\w_]*\/?([\d.]*)/i },
    { name: 'Instagram', pattern: /Instagram\s?([\d.]*)/i },
    { name: 'Twitter', pattern: /Twitter/i },
    { name: 'TikTok', pattern: /TikTok/i },
    { name: 'Snapchat', pattern: /Snapchat/i },
    { name: 'LinkedIn', pattern: /LinkedInApp/i },
    { name: 'Pinterest', pattern: /Pinterest/i },
    { name: 'WhatsApp', pattern: /WhatsApp\/?([\d.]*)/i },
    { name: 'Telegram', pattern: /TelegramBot/i },

    // Chromium-based (before Chrome)
    { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/?([\d.]*)/i },
    { name: 'Opera', pattern: /(?:OPR|Opera)\/?([\d.]*)/i },
    { name: 'Brave', pattern: /Brave\/?([\d.]*)/i },
    { name: 'Vivaldi', pattern: /Vivaldi\/?([\d.]*)/i },
    { name: 'Yandex', pattern: /YaBrowser\/?([\d.]*)/i },
    { name: 'Samsung Internet', pattern: /SamsungBrowser\/?([\d.]*)/i },
    { name: 'UC Browser', pattern: /UCBrowser\/?([\d.]*)/i },
    { name: 'QQ Browser', pattern: /QQBrowser\/?([\d.]*)/i },
    { name: 'Whale', pattern: /Whale\/?([\d.]*)/i },

    // Major browsers
    { name: 'Chrome', pattern: /(?:Chrome|CriOS)\/?([\d.]*)/i },
    { name: 'Firefox', pattern: /(?:Firefox|FxiOS)\/?([\d.]*)/i },
    { name: 'Safari', pattern: /Version\/([\d.]*)\s.*Safari/i },

    // Legacy IE
    { name: 'IE', pattern: /(?:MSIE\s|Trident.*rv:)([\d.]*)/i },
];

// OS detection patterns - ORDER MATTERS (specific before generic)
const OS_PATTERNS = [
    { name: 'iOS', pattern: /(?:iPhone|iPad|iPod).*?OS\s([\d_]+)/i, versionSep: '_' },
    // Android - exclude "like Android" (e.g., Kindle UA)
    { name: 'Android', pattern: /(?<!like\s)Android\s?([\d.]*)/i },
    { name: 'macOS', pattern: /Mac OS X\s?([\d_\.]*)/i, versionSep: '_' },
    {
        name: 'Windows', pattern: /Windows NT\s?([\d.]*)/i, versionMap: {
            '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP'
        }
    },
    { name: 'Chrome OS', pattern: /CrOS\s\w+\s([\d.]*)/i },
    // Specific distros before generic Linux
    { name: 'Ubuntu', pattern: /Ubuntu/i },
    { name: 'Fedora', pattern: /Fedora/i },
    { name: 'FreeBSD', pattern: /FreeBSD/i },
    { name: 'Linux', pattern: /Linux/i },
];

// Engine detection patterns
const ENGINES = [
    { name: 'Blink', pattern: /Chrome\/([\d.]+)/i }, // Modern Chrome, Edge, Opera
    { name: 'Gecko', pattern: /Gecko\/([\d.]+)/i },
    { name: 'WebKit', pattern: /AppleWebKit\/([\d.]+)/i },
    { name: 'Trident', pattern: /Trident\/([\d.]+)/i },
    { name: 'EdgeHTML', pattern: /Edge\/([\d.]+)/i },
    { name: 'Presto', pattern: /Presto\/([\d.]+)/i },
];

// Device type patterns - ORDER MATTERS (console before tablet/mobile to catch Xbox/PlayStation first)
const DEVICE_PATTERNS = [
    { type: 'console', pattern: /PlayStation|Xbox|Nintendo/i },
    { type: 'tablet', pattern: /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i },
    { type: 'mobile', pattern: /Mobile|Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Opera Mobi/i },
    { type: 'smarttv', pattern: /SmartTV|Smart-TV|GoogleTV|AppleTV|BRAVIA|WebOS|Tizen|HbbTV|NetCast/i },
    { type: 'wearable', pattern: /Watch|Fitbit/i },
    { type: 'embedded', pattern: /Embedded/i },
];

// Device vendor/model patterns
const DEVICE_VENDORS = [
    { vendor: 'Apple', pattern: /iPhone|iPad|iPod|Macintosh|AppleTV/i },
    { vendor: 'Samsung', pattern: /Samsung|SM-|GT-/i },
    { vendor: 'Huawei', pattern: /Huawei|HUAWEI/i },
    // Xiaomi: brand names + model codes (e.g., 24030PN60G, M2102J20SG)
    { vendor: 'Xiaomi', pattern: /Xiaomi|Mi\s|Redmi|\b\d{5}[A-Z]{2}\d{2}[A-Z]\b|\bM\d{4}[A-Z]\d{2}[A-Z]{2}\b/i },
    { vendor: 'Google', pattern: /Pixel|Nexus/i },
    { vendor: 'OnePlus', pattern: /OnePlus|ONEPLUS/i },
    { vendor: 'LG', pattern: /LG[-;\/\s]/i },
    // Sony: brand + Xperia + tablet codes (SGP)
    { vendor: 'Sony', pattern: /Sony|Xperia|PlayStation|\bSGP\d+\b/i },
    { vendor: 'Motorola', pattern: /Motorola|Moto\s|\bmoto\s/i },
    { vendor: 'HTC', pattern: /HTC/i },
    { vendor: 'Nokia', pattern: /Nokia/i },
    { vendor: 'Oppo', pattern: /OPPO/i },
    { vendor: 'Vivo', pattern: /vivo/i },
    { vendor: 'Realme', pattern: /RMX\d/i },
    // Microsoft: Xbox, Surface, and "Microsoft;" in UA
    { vendor: 'Microsoft', pattern: /Xbox|Surface|Microsoft;/i },
    { vendor: 'Nintendo', pattern: /Nintendo/i },
];

// CPU architecture patterns
const CPU_PATTERNS = [
    { architecture: 'arm64', pattern: /aarch64|arm64/i },
    { architecture: 'arm', pattern: /arm(?!64)/i },
    { architecture: 'amd64', pattern: /x64|x86_64|amd64|Win64|WOW64/i },
    { architecture: 'ia32', pattern: /x86|i[36]86/i },
];

// Bot detection - comprehensive list
const BOT_PATTERNS = [
    // AI bots
    /ChatGPT|GPTBot|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Google-Extended/i,
    // Traditional search
    /bot|crawl|spider|slurp|search|fetch|monitor|check|scan/i,
    // Specific bots
    /Googlebot|Bingbot|YandexBot|DuckDuckBot|Baiduspider|Sogou|Exabot|facebot|ia_archiver/i,
    // Tools
    /curl|wget|python|java|perl|ruby|php|http|node|axios|got\//i,
    // Headless
    /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|WebDriver/i,
];

// Model extraction patterns
const MODEL_PATTERNS = [
    // Apple devices - including iPad16,3 format
    { pattern: /(iPad\d+,\d+|iPhone\d+,\d+|iPod\d+,\d+)/, extract: (m) => m[1].replace(/\d+,\d+/, '') },
    { pattern: /(iPhone|iPad|iPod)[\s;]/, extract: (m) => m[1] },
    // Samsung
    { pattern: /(SM-[A-Z0-9]+|GT-[A-Z0-9]+)/i, extract: (m) => m[1] },
    // Google Pixel
    { pattern: /(Pixel[\s]?\d*[a-z]?\s?(?:Pro|XL)?)/i, extract: (m) => m[1].trim() },
    // Nexus
    { pattern: /(Nexus\s?\d+[a-z]?)/i, extract: (m) => m[1] },
    // Generic Android - "Build/MODEL" or "; MODEL Build"
    { pattern: /;\s*([^;)]+)\s*Build\//i, extract: (m) => m[1].trim() },
];

/**
 * Parse a User-Agent string and extract browser, OS, device, and bot info
 * @param {string|null|undefined} ua - The User-Agent string
 * @returns {Object} Parsed results matching ua-parser-js structure
 */
function parseUserAgent(ua) {
    // Handle null/undefined
    if (ua == null || typeof ua !== 'string') {
        return createEmptyResult(ua);
    }

    const result = {
        browser: { name: null, version: null, major: null },
        engine: { name: null, version: null },
        os: { name: null, version: null },
        device: { type: null, vendor: null, model: null },
        cpu: { architecture: null },
        isBot: false,
        raw: ua,
    };

    // Detect browser
    for (const { name, pattern } of BROWSERS) {
        const match = ua.match(pattern);
        if (match) {
            result.browser.name = name;
            result.browser.version = match[1] || null;
            result.browser.major = match[1] ? match[1].split('.')[0] : null;
            break;
        }
    }

    // Fallback: Safari without version
    if (!result.browser.name && /Safari/i.test(ua) && !/Chrome/i.test(ua)) {
        result.browser.name = 'Safari';
        const safariMatch = ua.match(/Safari\/([\d.]+)/i);
        result.browser.version = safariMatch ? safariMatch[1] : null;
        result.browser.major = result.browser.version ? result.browser.version.split('.')[0] : null;
    }

    // Detect engine
    for (const { name, pattern } of ENGINES) {
        const match = ua.match(pattern);
        if (match) {
            result.engine.name = name;
            result.engine.version = match[1] || null;
            break;
        }
    }

    // Detect OS
    for (const { name, pattern, versionSep, versionMap } of OS_PATTERNS) {
        const match = ua.match(pattern);
        if (match) {
            result.os.name = name;
            let version = match[1] || null;
            if (version && versionSep) {
                version = version.replace(new RegExp(versionSep, 'g'), '.');
            }
            if (version && versionMap && versionMap[version]) {
                version = versionMap[version];
            }
            result.os.version = version;
            break;
        }
    }

    // Detect device type (check tablet before mobile due to iPad containing 'Mobile')
    for (const { type, pattern } of DEVICE_PATTERNS) {
        if (pattern.test(ua)) {
            result.device.type = type;
            break;
        }
    }

    // Detect device vendor
    for (const { vendor, pattern } of DEVICE_VENDORS) {
        if (pattern.test(ua)) {
            result.device.vendor = vendor;
            break;
        }
    }

    // Detect device model
    for (const { pattern, extract } of MODEL_PATTERNS) {
        const match = ua.match(pattern);
        if (match) {
            result.device.model = extract(match);
            break;
        }
    }

    // Detect CPU architecture
    for (const { architecture, pattern } of CPU_PATTERNS) {
        if (pattern.test(ua)) {
            result.cpu.architecture = architecture;
            break;
        }
    }

    // Detect bot
    result.isBot = BOT_PATTERNS.some(pattern => pattern.test(ua));

    return result;
}

/**
 * Create an empty result for null/undefined/empty UA
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

module.exports = parseUserAgent;
