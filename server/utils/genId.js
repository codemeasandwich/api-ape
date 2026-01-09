/**
 * Random ID generator for api-ape
 * Generates unique client identifiers using a configurable character set
 * @module server/utils/genId
 */

/**
 * Generate a random ID string
 * @param {number} [size=10] - Length of the ID
 * @param {string} [range='0123456789ABCDEFGHJKMNPQRSTVWXYZ'] - Characters to use (excludes ambiguous chars like O, I, L)
 * @returns {string} Random ID string
 * @throws {Error} If size is not a positive number or range is not a non-empty string
 */
function genId(size, range) {

  size = size || 10
  range = range || "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

  if ('number' !== typeof size) {
    throw new Error("size must be a number")
  } else if (1 > size) {
    throw new Error("positive size needed")
  } else if ('string' !== typeof range) {
    throw new Error("range must be a string")
  } else if (1 > range.length) {
    throw new Error("range to small")
  }

  var id = ""

  for (var i = 0; i < size; i++) {
    id += range[~~(Math.random() * range.length)]
  }
  return id
}

module.exports = genId