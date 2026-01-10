/**
 * JSS Encoder - encodes objects to JSS format
 * @module utils/jss/encode
 */

const tagLookup = {
    '[object RegExp]': 'R',
    '[object Date]': 'D',
    '[object Error]': 'E',
    "[object Undefined]": 'U',
    "[object Map]": 'M',
    "[object Set]": 'S',
}

function encode(obj) {
    const visitedEncode = new WeakMap()
    visitedEncode.set(obj, [])

    function encodeValueWithVisited(value, path = []) {
        const type = typeof value
        const tag = tagLookup[Object.prototype.toString.call(value)]
        if (tag !== undefined) {
            if ('D' === tag) return [tag, value.valueOf()]
            if ('E' === tag) return [tag, [value.name, value.message, value.stack]]
            if ('R' === tag) return [tag, value.toString()]
            if ('U' === tag) return [tag, null]
            if ('S' === tag) return [tag, Array.from(value)]
            if ('M' === tag) return [tag, Object.fromEntries(value)]
            return [tag, JSON.stringify(value)]
        } else if (type === 'object' && value !== null) {
            if (visitedEncode.has(value)) return ['P', visitedEncode.get(value)]
            visitedEncode.set(value, path)
            const isArray = Array.isArray(value)
            const objKeys = isArray ? Array.from(Array(value.length).keys()) : Object.keys(value)
            const result = isArray ? [] : {}
            const typesFound = []
            for (let i = 0; i < objKeys.length; i++) {
                const key = objKeys[i]
                const [t, v] = encodeValueWithVisited(value[key], [...path, key])
                if (isArray) {
                    typesFound.push(t)
                    result.push(v)
                } else if (value[key] !== undefined) {
                    result[key + (t ? `<!${t}>` : '')] = v
                }
            }
            if (isArray && typesFound.find((t) => !!t)) return [`[${typesFound.join()}]`, result]
            return ['', result]
        } else {
            return ['', value]
        }
    }

    let keys = Array.isArray(obj) ? Array.from(Array(obj.length).keys()) : Object.keys(obj)
    const result = {}
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (obj[key] !== undefined) {
            const [t, v] = encodeValueWithVisited(obj[key], [key])
            result[key + (t ? `<!${t}>` : '')] = v
        }
    }
    return result
}

function stringify(obj) {
    return JSON.stringify(encode(obj))
}

module.exports = { encode, stringify }
