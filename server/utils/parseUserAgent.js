/**
 * Robust User-Agent Parser - Zero-dependency
 * @module server/utils/parseUserAgent
 */

const { BROWSERS, OS_PATTERNS, ENGINES, DEVICE_PATTERNS, DEVICE_VENDORS, CPU_PATTERNS, BOT_PATTERNS, MODEL_PATTERNS } = require('./userAgent/patterns')

function createEmptyResult(ua) {
    return {
        browser: { name: null, version: null, major: null },
        engine: { name: null, version: null },
        os: { name: null, version: null },
        device: { type: null, vendor: null, model: null },
        cpu: { architecture: null },
        isBot: false,
        raw: ua || null,
    }
}

function parseUserAgent(ua) {
    if (ua == null || typeof ua !== 'string') return createEmptyResult(ua)

    const result = createEmptyResult(ua)
    result.raw = ua

    for (const { name, pattern } of BROWSERS) {
        const match = ua.match(pattern)
        if (match) {
            result.browser.name = name
            result.browser.version = match[1] || null
            result.browser.major = match[1] ? match[1].split('.')[0] : null
            break
        }
    }

    if (!result.browser.name && /Safari/i.test(ua) && !/Chrome/i.test(ua)) {
        result.browser.name = 'Safari'
        const m = ua.match(/Safari\/([\d.]+)/i)
        result.browser.version = m ? m[1] : null
        result.browser.major = result.browser.version ? result.browser.version.split('.')[0] : null
    }

    for (const { name, pattern } of ENGINES) {
        const match = ua.match(pattern)
        if (match) { result.engine.name = name; result.engine.version = match[1] || null; break }
    }

    for (const { name, pattern, versionSep, versionMap } of OS_PATTERNS) {
        const match = ua.match(pattern)
        if (match) {
            result.os.name = name
            let version = match[1] || null
            if (version && versionSep) version = version.replace(new RegExp(versionSep, 'g'), '.')
            if (version && versionMap && versionMap[version]) version = versionMap[version]
            result.os.version = version
            break
        }
    }

    for (const { type, pattern } of DEVICE_PATTERNS) {
        if (pattern.test(ua)) { result.device.type = type; break }
    }

    for (const { vendor, pattern } of DEVICE_VENDORS) {
        if (pattern.test(ua)) { result.device.vendor = vendor; break }
    }

    for (const { pattern, extract } of MODEL_PATTERNS) {
        const match = ua.match(pattern)
        if (match) { result.device.model = extract(match); break }
    }

    for (const { architecture, pattern } of CPU_PATTERNS) {
        if (pattern.test(ua)) { result.cpu.architecture = architecture; break }
    }

    result.isBot = BOT_PATTERNS.some(pattern => pattern.test(ua))
    return result
}

module.exports = parseUserAgent
