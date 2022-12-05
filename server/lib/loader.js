const deeprequire = require('../utils/deepRequire')

const fs = require('fs')
const path = require('path')

let currentDir = __dirname
while(!fs.existsSync(path.join(currentDir, 'package.json'))) {
  currentDir = path.join(currentDir, '..')
}

module.exports = function(dirname,selector){
   return deeprequire(path.join(currentDir, dirname),selector)
}