/**
 * @fileoverview Deep Require Utility for api-ape Server
 *
 * This module provides automatic loading of controller files from a directory tree.
 * It recursively scans a directory for JavaScript files and loads them into a flat
 * object keyed by their path-based endpoint names.
 *
 * This is the core mechanism that enables api-ape's convention-based routing:
 * - File `api/users/list.js` becomes endpoint `/users/list`
 * - File `api/auth/login.js` becomes endpoint `/auth/login`
 * - File `api/posts/index.js` becomes endpoint `/posts`
 *
 * Key Features:
 * - **Recursive scanning**: Finds all JS files in nested directories
 * - **Convention-based routing**: File paths become endpoint paths
 * - **Index file support**: `index.js` files map to their parent directory
 * - **Duplicate detection**: Throws an error if two files map to the same endpoint
 * - **Case preservation**: Endpoint paths preserve original file name casing
 * - **Private file exclusion**: Files/directories starting with `_` are ignored
 *
 * @module server/utils/deepRequire
 * @see {@link module:server/lib/loader} - Uses this module to load controllers
 *
 * @example
 * // Directory structure:
 * // api/
 * //   users/
 * //     list.js      -> exports function
 * //     get.js       -> exports function
 * //     index.js     -> exports function
 * //   posts/
 * //     create.js    -> exports function
 *
 * const deepRequire = require('./deepRequire')
 * const controllers = deepRequire('/path/to/api')
 *
 * // Result:
 * // {
 * //   'users/list': [Function],
 * //   'users/get': [Function],
 * //   'users': [Function],        // from index.js
 * //   'posts/create': [Function]
 * // }
 */

// Ensure this module is only run on Node.js server
/* istanbul ignore next 3 - only reachable in browser environment */
if (!global.process) {
  throw new Error("deepRequire need to be run on Node server");
}

var fs = require("fs");
var path = require("path");

/**
 * Recursively collects all files with specified extensions from a directory.
 *
 * Walks the directory tree starting from `dir` and returns all files
 * that match the specified file types. The returned paths are relative
 * to the starting directory.
 *
 * @private
 * @function getFilesFromDir
 * @param {string} dir - The root directory to scan
 * @param {string[]} fileTypes - Array of file extensions to include (e.g., ['.js', '.ts'])
 * @returns {string[]} Array of file paths relative to `dir`, starting with '/'
 *
 * @example
 * // Directory structure:
 * // api/
 * //   users/
 * //     list.js
 * //     get.js
 * //   posts/
 * //     create.js
 *
 * getFilesFromDir('/path/to/api', ['.js'])
 * // Returns: ['/users/list.js', '/users/get.js', '/posts/create.js']
 */
function getFilesFromDir(dir, fileTypes) {
  var filesToReturn = [];

  /**
   * Inner recursive function to walk the directory tree.
   * @param {string} currentPath - Current directory being scanned
   */
  function walkDir(currentPath) {
    var files = fs.readdirSync(currentPath);

    for (var i in files) {
      var curFile = path.join(currentPath, files[i]);

      if (
        fs.statSync(curFile).isFile() &&
        fileTypes.indexOf(path.extname(curFile)) != -1
      ) {
        // File matches extension - add relative path
        filesToReturn.push(curFile.replace(dir, ""));
      } else if (fs.statSync(curFile).isDirectory()) {
        // Directory - recurse into it
        walkDir(curFile);
      }
    }
  }

  walkDir(dir);
  return filesToReturn;
}

/**
 * Regular expression to extract file extension.
 * Matches the last dot and everything after it, or nothing if no extension.
 * @private
 * @type {RegExp}
 */
const re = /(?:\.([^.]+))?$/;

/**
 * Loads all modules from a directory tree into a flat endpoint-keyed object.
 *
 * This function implements the convention-based routing system for api-ape:
 *
 * **Path to Endpoint Mapping:**
 * - `/users/list.js` → `users/list`
 * - `/users/get.js` → `users/get`
 * - `/users/index.js` → `users` (index files map to parent)
 * - `/posts/comments/list.js` → `posts/comments/list`
 *
 * **Processing Steps:**
 * 1. Recursively find all files with matching extensions
 * 2. For each file, compute the endpoint path
 * 3. Check for duplicate endpoints (throws error if found)
 * 4. Load the module using `require()`
 * 5. Return flat object mapping endpoints to modules
 *
 * @function deepRequire
 * @param {string} dirname - The root directory containing controller files
 * @param {string[]} [selector=['js']] - File extensions to include (without dots)
 * @returns {Object<string, *>} Object mapping endpoint paths to loaded modules
 * @throws {Error} If two files map to the same endpoint path
 *
 * @example
 * // Load all JavaScript controllers from 'api' directory
 * const controllers = deepRequire('./api')
 *
 * // Access a specific controller
 * const listUsers = controllers['users/list']
 *
 * @example
 * // Load JavaScript and TypeScript files
 * const controllers = deepRequire('./api', ['js', 'ts'])
 *
 * @example
 * // Directory with potential conflict (will throw error):
 * // api/
 * //   users.js        -> endpoint: 'users'
 * //   users/index.js  -> endpoint: 'users' (CONFLICT!)
 * //
 * // Error: Duplicate endpoint detected: "users"
 * //    - /users.js
 * //    - /users/index.js
 * //    Remove one of these files to fix this conflict.
 *
 * @example
 * // Typical usage in api-ape loader
 * const deepRequire = require('./utils/deepRequire')
 * const path = require('path')
 *
 * function loadControllers(where) {
 *     const apiDir = path.resolve(process.cwd(), where)
 *     return deepRequire(apiDir)
 * }
 */
module.exports = function (dirname, selector) {
  // Default to JavaScript files
  selector = selector || ["js"];

  /**
   * Track which file defines each endpoint for error messages.
   * @type {Object<string, string>}
   */
  const endpointSources = {};

  // Get all matching files and reduce into endpoint -> module map
  return getFilesFromDir(
    dirname,
    selector.map((ext) => `.${ext}`),
  ).reduce((packages, file) => {
    // Skip root index.js (typically re-exports or setup)
    if (file === "/index.js") return packages;

    // Skip underscore-prefixed files/directories (private/internal modules)
    // e.g., _helper.js, _internal/secret.js won't be exposed as endpoints
    if (file.includes("/_")) return packages;

    // Compute endpoint path from file path:
    // 1. Remove file extension
    // 2. Split into path parts
    // 3. Remove leading empty string from split
    // 4. If last part is 'index', remove it (index.js maps to parent)
    // 5. Join with '/'
    const pathParts = file
      .replace(re.exec(file)[0], "") // Remove extension
      .split("/")
      .slice(1); // Remove leading empty string

    // Handle index.js files - they map to their parent directory
    if (pathParts[pathParts.length - 1] === "index") {
      pathParts.pop();
    }

    // Create the endpoint path
    const endpoint = pathParts.join("/");

    // Check for duplicate endpoints
    /* istanbul ignore next 8 - startup error, would break all tests if triggered */
    if (packages[endpoint] !== undefined) {
      throw new Error(
        `🦍 Duplicate endpoint detected: "${endpoint}"\n` +
          `   - ${endpointSources[endpoint]}\n` +
          `   - ${file}\n` +
          `   Remove one of these files to fix this conflict.`,
      );
    }

    // Track source for error messages and load the module
    endpointSources[endpoint] = file;
    packages[endpoint] = require(dirname + `/${file}`);

    return packages;
  }, {});
};
