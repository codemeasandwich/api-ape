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
const { apeLog } = require("../../utils/apeLogger");
const {
  normaliseWatch,
  invalidateModules,
  restoreModules,
  watchDirs,
  SOURCE_EXTENSIONS,
} = require("./hotReload");

/**
 * Active watchers keyed by the controller map they reload.
 * @type {WeakMap<Object, {close: Function}>}
 */
const watchers = new WeakMap();

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
 * Computes the endpoint path from a file path.
 *
 * @private
 * @function computeEndpoint
 * @param {string} file - File path like '/users/list.js'
 * @returns {string|null} Endpoint like 'users/list', or null if file should be skipped
 */
function computeEndpoint(file) {
  // Skip root index.js (typically re-exports or setup)
  if (file === "/index.js") return null;

  // Skip underscore-prefixed files/directories (private/internal modules)
  if (file.includes("/_")) return null;

  // Compute endpoint path from file path:
  // 1. Remove file extension
  // 2. Split into path parts
  // 3. Remove leading empty string from split
  // 4. If last part is 'index', remove it (index.js maps to parent)
  // 5. Join with '/'
  const pathParts = file
    .replace(re.exec(file)[0], "")
    .split("/")
    .slice(1);

  // Handle index.js files - they map to their parent directory
  if (pathParts[pathParts.length - 1] === "index") {
    pathParts.pop();
  }

  // Skip if empty (was root index after removing 'index')
  if (pathParts.length === 0) return null;

  return pathParts.join("/");
}

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
 * @param {Object} [options]
 * @param {boolean|{paths?: string[], debounceMs?: number}} [options.watch=false] - Opt-in hot
 *     reload. Off by default. When on, a change evicts every cached module under the
 *     controller directory (and `watch.paths`) and reloads ALL controllers into the returned
 *     object in place. See {@link module:server/utils/hotReload} for the contract and limits.
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
module.exports = function (dirname, selector, options = {}) {
  // Default to JavaScript files
  selector = selector || ["js"];

  /**
   * Scan the directory and require every controller into a fresh endpoint map.
   * @returns {Object<string, *>} New endpoint-keyed map
   * @throws {Error} On a duplicate endpoint or a controller that fails to load
   */
  function loadAll() {
    // Track which file defines each endpoint for error messages.
    const endpointSources = {};
    const loaded = {};

    getFilesFromDir(dirname, selector.map((ext) => `.${ext}`)).forEach((file) => {
      const endpoint = computeEndpoint(file);
      if (!endpoint) return;

      // Check for duplicate endpoints
      if (loaded[endpoint] !== undefined) {
        throw new Error(
          `🦍 Duplicate endpoint detected: "${endpoint}"\n` +
            `   - ${endpointSources[endpoint]}\n` +
            `   - ${file}\n` +
            `   Remove one of these files to fix this conflict.`,
        );
      }

      // Track source for error messages and load the module
      endpointSources[endpoint] = file;
      loaded[endpoint] = require(dirname + `/${file}`);
    });
    return loaded;
  }

  /**
   * Object mapping endpoint paths to loaded modules. Reload swaps its contents
   * in place so references held by the wiring layer stay valid.
   * @type {Object<string, *>}
   */
  const packages = loadAll();

  const watch = normaliseWatch(options.watch, dirname);
  if (watch) {
    watchers.set(
      packages,
      watchDirs({
        roots: watch.roots,
        extensions: [...new Set([...selector, ...SOURCE_EXTENSIONS])],
        debounceMs: watch.debounceMs,
        onChange: (files) => {
          const saved = new Map();
          invalidateModules(watch.roots, undefined, saved);
          let next;
          try {
            next = loadAll();
          } catch (err) {
            restoreModules(watch.roots, saved);
            apeLog.error(
              `[api-ape] Reload failed, still serving the previous controllers: ${err.message}`,
            );
            return;
          }
          const before = Object.keys(packages);
          before.filter((k) => !(k in next)).forEach((k) => delete packages[k]);
          Object.assign(packages, next);
          apeLog.log(
            `Reloaded ${Object.keys(next).length} controllers` +
              (files.length ? ` (changed: ${files.map((f) => path.relative(watch.roots[0], f)).join(", ")})` : ""),
          );
        },
      }),
    );
  }

  return packages;
};

/**
 * Stop the hot-reload watcher belonging to a controller map returned by
 * `deepRequire(..., { watch })`. A no-op for maps that are not being watched.
 *
 * @param {Object<string, *>} packages - The map returned by deepRequire
 * @returns {void}
 */
module.exports.stopWatching = function (packages) {
  const handle = watchers.get(packages);
  if (handle) {
    handle.close();
    watchers.delete(packages);
  }
};
