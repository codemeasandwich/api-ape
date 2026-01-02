//JsonSuperSet

// TODO: add tests
// check for any repeated ref not just cyclical references
// support nasted array a<![,,[D]]>:["a","b",[Date]]
// support array for the same type a<![*D]>:[Date,Date,Date]

function encode(obj) {
    const tagLookup = {
        '[object RegExp]': 'R',
        '[object Date]': 'D',
        '[object Error]': 'E',
        "[object Undefined]": 'U',
        "[object Map]": 'M',
        "[object Set]": 'S',
    };
    const visited = new WeakMap();

    function encodeValue(value, path = '') {
        const type = typeof value;
        const tag = tagLookup[Object.prototype.toString.call(value)];
        // console.log({tag,value,path})
        if (tag !== undefined) {
            if ('D' === tag) return [tag, value.valueOf()];
            if ('E' === tag) return [tag, [value.name, value.message, value.stack]];
            if ('R' === tag) return [tag, value.toString()];
            if ('U' === tag) return [tag, null];
            if ('S' === tag) return [tag, Array.from(value)];
            if ('M' === tag) return [tag, Object.fromEntries(value)];

            return [tag, JSON.stringify(value)];
        } else if (type === 'object' && value !== null) {
            /*if (value.$ID) {
              return ['', value.$ID];
            }*/
            if (visited.has(value)) {
                return ['P', visited.get(value)];
            }
            visited.set(value, path);
            const isArray = Array.isArray(value);
            // keep index with undefined in Array
            const keys = isArray ? Array.from(Array(value.length).keys()) : Object.keys(value);
            const result = isArray ? [] : {};
            const typesFound = [];
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const [t, v] = encodeValue(value[key], key);
                // console.log([t, v])
                if (isArray) {
                    typesFound.push(t);
                    result.push(v);
                    // remove key with undefined from Objects
                } else if (value[key] !== undefined) {
                    result[key + (t ? `<!${t}>` : '')] = v;
                }
            }

            visited.delete(value);
            if (isArray && typesFound.find((t) => !!t)) {
                return [`[${typesFound.join()}]`, result];
            }
            return ['', result];
        } else {
            return ['', value];
        }
    } // END encodeValue

    let keys = [];
    // console.log(obj)
    if (Array.isArray(obj)) {
        keys = Array.from(Array(obj.length).keys())
    } else {
        keys = Object.keys(obj);
    }


    const result = {};
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        // remove key with undefined from Objects
        if (obj[key] !== undefined) {
            const [t, v] = encodeValue(obj[key], key);
            result[key + (t ? `<!${t}>` : '')] = v;
        }
    }
    return result;
} // END encode

function stringify(obj) {
    return JSON.stringify(encode(obj))
}


function parse(encoded) {
    return decode(JSON.parse(encoded))
}

function decode(data) {
    const result = {};
    const pointers2Res = [];
    const tagLookup = {
        R: (s) => new RegExp(s),
        D: (n) => new Date(n),
        P: function (sourceToPointAt, replaceAtThisPlace) {
            pointers2Res.push([sourceToPointAt, replaceAtThisPlace + '']);
            return sourceToPointAt;
        },
        E: ([name, message, stack]) => {
            let err;
            try {
                err = new global[name](message);
                if (err instanceof Error) err.stack = stack;
                else throw {};
            } catch (e) {
                err = new Error(message);
                err.name = name;
                err.stack = stack;
            }
            return err;
        },
        U: () => undefined,
        S: (a) => new Set(a),
        M: (o) => new Map(Object.entries(o))
    };
    // TODO: remove visited, as this is handled by pointers2Res
    const visited = new Map();

    function decodeValue(name, tag, val) {
        if (tag in tagLookup) {
            return tagLookup[tag](val, this);
        } else if (Array.isArray(val)) {
            if (tag && tag.startsWith('[')) {
                const typeTags = tag.slice(1, -1).split(',');
                const result = [];
                for (let i = 0; i < val.length; i++) {
                    const decodedValue = decodeValue.call(
                        `${this}${this ? '/' : ''}${name}`,
                        '',
                        typeTags[i],
                        val[i]
                    );
                    result.push(decodedValue);
                }
                return result;
            } else {
                const result = [];
                for (let i = 0; i < val.length; i++) {
                    const decodedValue = decodeValue.call(`${this}${this ? '/' : ''}${name}`, '', '', val[i]);
                    result.push(decodedValue);
                }
                return result;
            }
        } else if ('object' === typeof val && val !== null) {
            if (visited.has(val)) {
                return visited.get(val);
            }
            visited.set(val, {});
            const result = {};
            for (const key in val) {
                const [nam, tag] = parseKeyWithTags(key);
                const decodedValue = decodeValue.call(
                    `${name}${name ? '/' : ''}${nam}`,
                    nam,
                    tag,
                    val[key]
                );
                result[nam] = decodedValue;
            }
            visited.set(val, result);
            return result;
        } else {
            return val;
        }
    } // END decodeValue

    function parseKeyWithTags(key) {
        const match = key.match(/(.+)(<!(.+)>)/);
        if (match) {
            return [match[1], match[3]];
        } else {
            return [key, undefined];
        }
    } // END parseKeyWithTags

    for (const key in data) {
        const [name, tag] = parseKeyWithTags(key);

        result[name] = decodeValue.call('', name, tag, data[key]);
    }
    pointers2Res.forEach(changeAttributeReference.bind(null, result));
    return result;
} // END decode

function changeAttributeReference(obj, [refPath, attrPath]) {
    const refKeys = refPath.split('/');
    const attrKeys = attrPath.split('/');
    let ref = obj;
    let attr = obj; // Traverse the reference path to get the reference object
    for (let i = 0; i < refKeys.length - 1; i++) {
        ref = ref[refKeys[i]];
    } // Traverse the attribute path to get the attribute object
    for (let i = 0; i < attrKeys.length - 1; i++) {
        attr = attr[attrKeys[i]];
    } // Set the attribute to the reference
    attr[attrKeys[attrKeys.length - 1]] = ref[refKeys[refKeys.length - 1]];
    return obj;
} // END changeAttributeReference


module.exports = { parse, stringify, encode, decode };
