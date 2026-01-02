/**
 * Flatten a nested object into dot-notation keys
 * e.g. { bio: { mail: '1@2.3' } } => { 'bio.mail': '1@2.3' }
 */
function flattenObject(obj, prefix = '') {
    return Object.keys(obj).reduce((acc, key) => {
        const prefixedKey = prefix ? `${prefix}.${key}` : key
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(acc, flattenObject(obj[key], prefixedKey))
        } else {
            acc[prefixedKey] = obj[key]
        }
        return acc
    }, {})
}

module.exports = flattenObject
