/**
 * @fileoverview Schema Generator for api-ape
 *
 * Generates a complete schema from a directory of controller files,
 * using the same discovery logic as api-ape's loader.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  extractSchema,
  getSupportedExtensions,
  shouldProcessFile,
} = require("./extractor");

/**
 * Regular expression to extract file extension
 * @private
 */
const extRegex = /(?:\.([^.]+))?$/;

/**
 * Recursively collect all files with specified extensions
 *
 * @param {string} dir - Root directory to scan
 * @param {string[]} extensions - File extensions to include (with dots, e.g., ['.js'])
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
 * @param {string} file - File path like '/users/list.js' or '/users/list.ts'
 * @returns {string|null} Endpoint like 'users/list', or null if should be skipped
 */
function computeEndpoint(file) {
  // Skip root index files
  if (file === "/index.js" || file === "/index.ts") return null;

  // Skip underscore-prefixed files/directories (private)
  if (file.includes("/_")) return null;

  // Skip .d.ts files (they're companions, not controllers)
  if (file.endsWith(".d.ts")) return null;

  // Remove extension and leading slash
  const ext = extRegex.exec(file)[0];
  const pathParts = file.replace(ext, "").split("/").slice(1);

  // index.js/index.ts maps to parent directory
  if (pathParts[pathParts.length - 1] === "index") {
    pathParts.pop();
  }

  if (pathParts.length === 0) return null;

  return pathParts.join("/");
}

/**
 * Generate a version hash from schema content
 *
 * @param {object} endpoints - Endpoints array
 * @returns {string} Short hash for cache invalidation
 */
function generateVersionHash(endpoints) {
  const content = JSON.stringify(
    endpoints.map((e) => ({
      path: e.path,
      input: e.input,
      output: e.output,
    }))
  );
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

/**
 * Generate schema from a controller directory
 *
 * @param {string} controllersDir - Absolute path to controllers directory
 * @param {object} [options] - Generation options
 * @param {string[]} [options.extensions] - File extensions to include (defaults to ['js', 'ts'])
 * @returns {ApeSchema}
 */
function generateSchema(controllersDir, options = {}) {
  const extensions = options.extensions
    ? options.extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`))
    : getSupportedExtensions();

  const files = getFilesFromDir(controllersDir, extensions);
  const endpoints = [];

  for (const file of files) {
    const endpoint = computeEndpoint(file);
    if (!endpoint) continue;

    const fullPath = path.join(controllersDir, file);

    // Skip files that shouldn't be processed
    if (!shouldProcessFile(fullPath)) continue;

    const schema = extractSchema(fullPath);

    endpoints.push({
      path: endpoint,
      filePath: fullPath,
      line: schema.line || 1,
      column: 1,
      description: schema.description,
      input: schema.input,
      output: schema.output,
      throws: schema.throws || [],
      schemaSource: schema.source,
    });
  }

  // Sort endpoints alphabetically for consistent output
  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const schema = {
    version: generateVersionHash(endpoints),
    timestamp: Date.now(),
    controllersDir,
    endpoints,
    channels: [], // TODO: Extract from publish() calls via static analysis
  };

  return schema;
}

module.exports = {
  generateSchema,
  computeEndpoint,
  getFilesFromDir,
};
