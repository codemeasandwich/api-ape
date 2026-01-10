/**
 * JSS Decoder - decodes JSS format back to objects
 * @module utils/jss/decode
 */

let pointers2Res = []

const tagLookup = {
    R: (s) => new RegExp(s),
    D: (n) => new Date(n),
    P: (sourcePath, currentPath) => {
        pointers2Res.push([sourcePath, currentPath])
        return null
    },
    E: ([name, message, stack]) => {
        let err
        try {
            err = new global[name](message)
            if (err instanceof Error) err.stack = stack
            else throw {}
        } catch (e) {
            err = new Error(message)
            err.name = name
            err.stack = stack
        }
        return err
    },
    U: () => undefined,
    S: (a) => new Set(a),
    M: (o) => new Map(Object.entries(o))
}

function parseKeyWithTags(key) {
    const match = key.match(/(.+)<!(.*)>/)
    if (match) {
        const name = match[1]
        let tag = match[2]
        // Handle the different tag formats from original jss.js
        if (tag.startsWith('[') && !tag.endsWith(']')) tag += ']'
        return [name, tag]
    }
    return [key, undefined]
}

function decodeValue(val, tag, path = []) {
    if (tag in tagLookup) return tagLookup[tag](val, path)

    if (Array.isArray(val)) {
        const res = []
        const isTaggedArray = tag && tag.startsWith('[')
        const typeTags = isTaggedArray ? tag.slice(1, -1).split(',') : []

        for (let i = 0; i < val.length; i++) {
            res.push(decodeValue(val[i], typeTags[i], [...path, i]))
        }
        return res
    }

    if (val !== null && typeof val === 'object') {
        const res = {}
        for (const key in val) {
            const [name, t] = parseKeyWithTags(key)
            res[name] = decodeValue(val[key], t, [...path, name])
        }
        return res
    }

    return val
}

function resolvePointers(obj, [refPath, attrPath]) {
    let ref = obj
    for (const key of refPath) ref = ref[key]

    let attrParent = obj
    for (let i = 0; i < attrPath.length - 1; i++) {
        attrParent = attrParent[attrPath[i]]
    }
    attrParent[attrPath[attrPath.length - 1]] = ref
}

function decode(data) {
    pointers2Res = []
    const result = decodeValue(data, undefined, [])
    pointers2Res.forEach(p => resolvePointers(result, p))
    return result
}

function parse(encoded) {
    return decode(JSON.parse(encoded))
}

module.exports = { decode, parse }
