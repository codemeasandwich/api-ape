/**
 * @fileoverview Schema Endpoint for api-ape Server
 *
 * Provides HTTP endpoint for schema introspection, allowing LSP and CLI tools
 * to fetch endpoint metadata from a running server.
 */

const fs = require("fs");
const path = require("path");
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
 * Cached schema data
 * @type {{ schema: object, hash: string } | null}
 */
let cachedSchema = null;

/**
 * Recursively collect all files with specified extensions
 *
 * @param {string} dir - Root directory to scan
 * @param {string[]} extensions - File extensions to include (with dots)
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

  const ext = extRegex.exec(file)[0];
  const pathParts = file.replace(ext, "").split("/").slice(1);

  if (pathParts[pathParts.length - 1] === "index") {
    pathParts.pop();
  }

  if (pathParts.length === 0) return null;

  return pathParts.join("/");
}

/**
 * Generate schema from controller directory
 *
 * @param {string} controllersDir - Absolute path to controllers
 * @returns {object} Schema object
 */
function generateSchema(controllersDir) {
  const extensions = getSupportedExtensions();
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

  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const crypto = require("crypto");
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

/**
 * Create HTTP handler for schema endpoint
 *
 * @param {string} controllersDir - Absolute path to controllers directory
 * @returns {Function} HTTP request handler
 */
function createSchemaHandler(controllersDir) {
  // Generate initial schema
  cachedSchema = {
    schema: generateSchema(controllersDir),
    hash: null,
  };
  cachedSchema.hash = cachedSchema.schema.version;

  return function handleSchemaRequest(req, res) {
    // Check ETag for caching
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === cachedSchema.hash) {
      res.writeHead(304);
      res.end();
      return;
    }

    // Set CORS headers for cross-origin requests from LSP
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("ETag", cachedSchema.hash);
    res.setHeader("Cache-Control", "no-cache");

    res.writeHead(200);
    res.end(JSON.stringify(cachedSchema.schema, null, 2));
  };
}

/**
 * Refresh cached schema (call when controllers change)
 *
 * @param {string} controllersDir - Absolute path to controllers directory
 */
function refreshSchema(controllersDir) {
  if (cachedSchema) {
    cachedSchema.schema = generateSchema(controllersDir);
    cachedSchema.hash = cachedSchema.schema.version;
  }
}

module.exports = {
  createSchemaHandler,
  refreshSchema,
  generateSchema,
};
