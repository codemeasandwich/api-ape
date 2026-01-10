/**
 * User-Agent pattern definitions
 * @module server/utils/userAgent/patterns
 */

const BROWSERS = [
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
    { name: 'Facebook', pattern: /\bFB[\w_]*\/?([\d.]*)/i },
    { name: 'Instagram', pattern: /Instagram\s?([\d.]*)/i },
    { name: 'Twitter', pattern: /Twitter/i },
    { name: 'TikTok', pattern: /TikTok/i },
    { name: 'Snapchat', pattern: /Snapchat/i },
    { name: 'LinkedIn', pattern: /LinkedInApp/i },
    { name: 'Pinterest', pattern: /Pinterest/i },
    { name: 'WhatsApp', pattern: /WhatsApp\/?([\d.]*)/i },
    { name: 'Telegram', pattern: /TelegramBot/i },
    { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/?([\d.]*)/i },
    { name: 'Opera', pattern: /(?:OPR|Opera)\/?([\d.]*)/i },
    { name: 'Brave', pattern: /Brave\/?([\d.]*)/i },
    { name: 'Vivaldi', pattern: /Vivaldi\/?([\d.]*)/i },
    { name: 'Yandex', pattern: /YaBrowser\/?([\d.]*)/i },
    { name: 'Samsung Internet', pattern: /SamsungBrowser\/?([\d.]*)/i },
    { name: 'UC Browser', pattern: /UCBrowser\/?([\d.]*)/i },
    { name: 'QQ Browser', pattern: /QQBrowser\/?([\d.]*)/i },
    { name: 'Whale', pattern: /Whale\/?([\d.]*)/i },
    { name: 'Chrome', pattern: /(?:Chrome|CriOS)\/?([\d.]*)/i },
    { name: 'Firefox', pattern: /(?:Firefox|FxiOS)\/?([\d.]*)/i },
    { name: 'Safari', pattern: /Version\/([\d.]*)\s.*Safari/i },
    { name: 'IE', pattern: /(?:MSIE\s|Trident.*rv:)([\d.]*)/i },
]

const OS_PATTERNS = [
    { name: 'iOS', pattern: /(?:iPhone|iPad|iPod).*?OS\s([\d_]+)/i, versionSep: '_' },
    { name: 'Android', pattern: /(?<!like\s)Android\s?([\d.]*)/i },
    { name: 'macOS', pattern: /Mac OS X\s?([\d_\.]*)/i, versionSep: '_' },
    {
        name: 'Windows', pattern: /Windows NT\s?([\d.]*)/i, versionMap: {
            '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP'
        }
    },
    { name: 'Chrome OS', pattern: /CrOS\s\w+\s([\d.]*)/i },
    { name: 'Ubuntu', pattern: /Ubuntu/i },
    { name: 'Fedora', pattern: /Fedora/i },
    { name: 'FreeBSD', pattern: /FreeBSD/i },
    { name: 'Linux', pattern: /Linux/i },
]

const ENGINES = [
    { name: 'Blink', pattern: /Chrome\/([\d.]+)/i },
    { name: 'Gecko', pattern: /Gecko\/([\d.]+)/i },
    { name: 'WebKit', pattern: /AppleWebKit\/([\d.]+)/i },
    { name: 'Trident', pattern: /Trident\/([\d.]+)/i },
    { name: 'EdgeHTML', pattern: /Edge\/([\d.]+)/i },
    { name: 'Presto', pattern: /Presto\/([\d.]+)/i },
]

const DEVICE_PATTERNS = [
    { type: 'console', pattern: /PlayStation|Xbox|Nintendo/i },
    { type: 'tablet', pattern: /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i },
    { type: 'mobile', pattern: /Mobile|Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Opera Mobi/i },
    { type: 'smarttv', pattern: /SmartTV|Smart-TV|GoogleTV|AppleTV|BRAVIA|WebOS|Tizen|HbbTV|NetCast/i },
    { type: 'wearable', pattern: /Watch|Fitbit/i },
    { type: 'embedded', pattern: /Embedded/i },
]

const DEVICE_VENDORS = [
    { vendor: 'Apple', pattern: /iPhone|iPad|iPod|Macintosh|AppleTV/i },
    { vendor: 'Samsung', pattern: /Samsung|SM-|GT-/i },
    { vendor: 'Huawei', pattern: /Huawei|HUAWEI/i },
    { vendor: 'Xiaomi', pattern: /Xiaomi|Mi\s|Redmi|\b\d{5}[A-Z]{2}\d{2}[A-Z]\b|\bM\d{4}[A-Z]\d{2}[A-Z]{2}\b/i },
    { vendor: 'Google', pattern: /Pixel|Nexus/i },
    { vendor: 'OnePlus', pattern: /OnePlus|ONEPLUS/i },
    { vendor: 'LG', pattern: /LG[-;\/\s]/i },
    { vendor: 'Sony', pattern: /Sony|Xperia|PlayStation|\bSGP\d+\b/i },
    { vendor: 'Motorola', pattern: /Motorola|Moto\s|\bmoto\s/i },
    { vendor: 'HTC', pattern: /HTC/i },
    { vendor: 'Nokia', pattern: /Nokia/i },
    { vendor: 'Oppo', pattern: /OPPO/i },
    { vendor: 'Vivo', pattern: /vivo/i },
    { vendor: 'Realme', pattern: /RMX\d/i },
    { vendor: 'Microsoft', pattern: /Xbox|Surface|Microsoft;/i },
    { vendor: 'Nintendo', pattern: /Nintendo/i },
]

const CPU_PATTERNS = [
    { architecture: 'arm64', pattern: /aarch64|arm64/i },
    { architecture: 'arm', pattern: /arm(?!64)/i },
    { architecture: 'amd64', pattern: /x64|x86_64|amd64|Win64|WOW64/i },
    { architecture: 'ia32', pattern: /x86|i[36]86/i },
]

const BOT_PATTERNS = [
    /ChatGPT|GPTBot|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Google-Extended/i,
    /bot|crawl|spider|slurp|search|fetch|monitor|check|scan/i,
    /Googlebot|Bingbot|YandexBot|DuckDuckBot|Baiduspider|Sogou|Exabot|facebot|ia_archiver/i,
    /curl|wget|python|java|perl|ruby|php|http|node|axios|got\//i,
    /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|WebDriver/i,
]

const MODEL_PATTERNS = [
    { pattern: /(iPad\d+,\d+|iPhone\d+,\d+|iPod\d+,\d+)/, extract: (m) => m[1].replace(/\d+,\d+/, '') },
    { pattern: /(iPhone|iPad|iPod)[\s;]/, extract: (m) => m[1] },
    { pattern: /(SM-[A-Z0-9]+|GT-[A-Z0-9]+)/i, extract: (m) => m[1] },
    { pattern: /(Pixel[\s]?\d*[a-z]?\s?(?:Pro|XL)?)/i, extract: (m) => m[1].trim() },
    { pattern: /(Nexus\s?\d+[a-z]?)/i, extract: (m) => m[1] },
    { pattern: /;\s*([^;)]+)\s*Build\//i, extract: (m) => m[1].trim() },
]

module.exports = { BROWSERS, OS_PATTERNS, ENGINES, DEVICE_PATTERNS, DEVICE_VENDORS, CPU_PATTERNS, BOT_PATTERNS, MODEL_PATTERNS }
