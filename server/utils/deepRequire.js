/**
 * Deep require utility for api-ape
 * Recursively loads all JS files from a directory into a flat object
 * @module server/utils/deepRequire
 */

if (!global.process) {
  throw new Error("deepRequire need to be run on Node server")
}

var fs = require('fs');
var path = require('path');

/**
 * Recursively get all files of specified types from a directory
 * @param {string} dir - Directory path to search
 * @param {string[]} fileTypes - Array of file extensions (e.g., ['.js', '.ts'])
 * @returns {string[]} Array of file paths relative to dir
 */
function getFilesFromDir(dir, fileTypes) {
  var filesToReturn = [];
  function walkDir(currentPath) {
    var files = fs.readdirSync(currentPath);
    for (var i in files) {
      var curFile = path.join(currentPath, files[i]);
      if (fs.statSync(curFile).isFile() && fileTypes.indexOf(path.extname(curFile)) != -1) {
        filesToReturn.push(curFile.replace(dir, ''));
      } else if (fs.statSync(curFile).isDirectory()) {
        walkDir(curFile);
      }
    }
  };
  walkDir(dir);
  return filesToReturn;
}
const re = /(?:\.([^.]+))?$/;

/**
 * Load all modules from a directory into a flat object keyed by path
 * @param {string} dirname - Directory path to load from
 * @param {string[]} [selector=['js']] - File extensions to include
 * @returns {object} Object mapping endpoint paths to loaded modules
 * @throws {Error} If duplicate endpoints are detected
 */
module.exports = function (dirname, selector) {
  selector = selector || ["js"]
  const endpointSources = {} // Track which file defines each endpoint

  return getFilesFromDir(dirname, selector.map(ext => `.${ext}`)).reduce((packages, file) => {

    if (file === "/index.js") return packages
    //if(file[0] !== "/") file = "/"+file;

    const pathParts = file.replace(re.exec(file)[0], "").split("/").slice(1)
    if (pathParts[pathParts.length - 1] === "index")
      pathParts.pop()

    const endpoint = pathParts.join("/").toLowerCase()

    // Check for duplicate endpoints
    if (packages[endpoint] !== undefined) {
      throw new Error(
        `🦍 Duplicate endpoint detected: "${endpoint}"\n` +
        `   - ${endpointSources[endpoint]}\n` +
        `   - ${file}\n` +
        `   Remove one of these files to fix this conflict.`
      )
    }

    endpointSources[endpoint] = file
    packages[endpoint] = require(dirname + `/${file}`)
    return packages;
  }, {});

}
