/**
 * Controller loader for api-ape
 * Recursively loads all controller files from the specified directory
 * @module server/lib/loader
 */

const deeprequire = require('../utils/deepRequire')
const path = require('path')

// Use the current working directory (where node was started)
// This ensures 'where' folder is relative to the calling application
const currentDir = process.cwd()

/**
 * Load all controller files from a directory
 * @param {string} dirname - Directory name relative to current working directory
 * @param {function} [selector] - Optional selector function to filter files
 * @returns {object} Object tree of loaded controller functions
 */
module.exports = function (dirname, selector) {
  return deeprequire(path.join(currentDir, dirname), selector)
}