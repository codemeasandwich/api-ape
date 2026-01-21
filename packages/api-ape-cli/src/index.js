/**
 * @fileoverview API-ape CLI Core Functions
 *
 * Provides schema generation and type generation from controller files.
 * This is a standalone implementation that works without a running server.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseJSDoc, parseTypeString } = require("./jsdoc-parser");
const { generateTypes } = require("./type-generator");

/**
 * Regular expression to extract file extension
 * @private
 */
const extRegex = /(?:\.([^.]+))?$/;

/**
 * Recursively collect all files with specified extensions
 *
 * @param {string} dir - Root directory to scan
 * @param {string[]} extensions - File extensions (with dots)
 * @returns {string[]} Array of file paths relative to dir
 */
function getFilesFromDir(dir, extensions) {
  const files = [];

  /**
   * Walk directory recursively
   *
   * @param {string} currentPath - Current directory path
   */
  function walkDir(currentPath) {
    const entries = fs.readdirSync(currentPath);

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && extensions.includes(path.extname(entry))) {
        files.push(fullPath.replace(dir, ""));
      } else if (stat.isDirectory()) {
        walkDir(fullPath);
      }
    }
  }

  walkDir(dir);
  return files;
}

/**
 * Compute endpoint path from file path
 *
 * @param {string} file - File path like '/users/list.js'
 * @returns {string|null} Endpoint or null
 */
function computeEndpoint(file) {
  if (file === "/index.js") return null;
  if (file.includes("/_")) return null;

  const ext = extRegex.exec(file)[0];
  const pathParts = file.replace(ext, "").split("/").slice(1);

  if (pathParts[pathParts.length - 1] === "index") {
    pathParts.pop();
  }

  if (pathParts.length === 0) return null;
  return pathParts.join("/");
}

/**
 * Generate schema from controllers directory
 *
 * @param {string} controllersDir - Absolute path to controllers
 * @param {object} [options] - Options
 * @param {string[]} [options.extensions] - File extensions to scan
 * @returns {object} Schema
 */
function generateSchema(controllersDir, options = {}) {
  const extensions = (options.extensions || ["js"]).map((ext) =>
    ext.startsWith(".") ? ext : `.${ext}`
  );

  const files = getFilesFromDir(controllersDir, extensions);
  const endpoints = [];

  for (const file of files) {
    const endpoint = computeEndpoint(file);
    if (!endpoint) continue;

    const fullPath = path.join(controllersDir, file);
    const doc = parseJSDoc(fullPath);

    endpoints.push({
      path: endpoint,
      filePath: fullPath,
      line: doc.line,
      column: 1,
      description: doc.description,
      input: doc.input,
      output: doc.output,
      throws: doc.throws,
    });
  }

  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const hash = crypto
    .createHash("md5")
    .update(JSON.stringify(endpoints.map((e) => e.path)))
    .digest("hex")
    .slice(0, 8);

  return {
    version: hash,
    timestamp: Date.now(),
    controllersDir,
    endpoints,
    channels: [],
  };
}

module.exports = {
  generateSchema,
  generateTypes,
  parseJSDoc,
  parseTypeString,
};
