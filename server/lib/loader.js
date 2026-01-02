const deeprequire = require('../utils/deepRequire')
const path = require('path')

// Use the current working directory (where node was started)
// This ensures 'where' folder is relative to the calling application
const currentDir = process.cwd()

module.exports = function (dirname, selector) {
  return deeprequire(path.join(currentDir, dirname), selector)
}