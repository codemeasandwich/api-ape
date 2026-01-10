/**
 * JSON Super Set (JSS) - Extended JSON serialization
 * Supports Date, RegExp, Error, undefined, Map, Set, and circular references
 * @module utils/jss
 */

const { encode, stringify } = require('./jss/encode')
const { decode, parse } = require('./jss/decode')

module.exports = { parse, stringify, encode, decode }
