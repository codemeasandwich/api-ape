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
  setLogger: setExtractorLogger,
} = require("./extractor");
const {
  getConflictType,
  getConflictMessage,
  getConflictSeverity,
} = require("./reserved-names");

/** @type {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} */
let logger = console;

/**
 * Set the logger for schema generator
 * @param {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} l
 */
function setLogger(l) {
  logger = l || console;
  // Propagate logger to extractor
  setExtractorLogger(l);
}

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
  logger.log?.(`[SCHEMA] getFilesFromDir() starting for: ${dir}`);
  logger.log?.(`[SCHEMA]   Looking for extensions: [${extensions.join(', ')}]`);
  const files = [];

  /**
   * Walk directory recursively
   *
   * @param {string} currentPath - Current directory path
   */
  function walkDir(currentPath) {
    logger.log?.(`[SCHEMA]   Walking: ${currentPath}`);
    const entries = fs.readdirSync(currentPath);

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && extensions.includes(path.extname(entry))) {
        const relativePath = fullPath.replace(dir, "");
        files.push(relativePath);
        logger.log?.(`[SCHEMA]   Found file: ${relativePath}`);
      } else if (stat.isDirectory()) {
        walkDir(fullPath);
      }
    }
  }

  walkDir(dir);
  logger.log?.(`[SCHEMA]   Total files found: ${files.length}`);
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
  if (file === "/index.js" || file === "/index.ts") {
    logger.log?.(`[SCHEMA]   computeEndpoint(${file}) → SKIP: root index file`);
    return null;
  }

  // Skip underscore-prefixed files/directories (private)
  if (file.includes("/_")) {
    logger.log?.(`[SCHEMA]   computeEndpoint(${file}) → SKIP: underscore prefix (private)`);
    return null;
  }

  // Skip .d.ts files (they're companions, not controllers)
  if (file.endsWith(".d.ts")) {
    logger.log?.(`[SCHEMA]   computeEndpoint(${file}) → SKIP: .d.ts companion file`);
    return null;
  }

  // Remove extension and leading slash
  const ext = extRegex.exec(file)[0];
  const pathParts = file.replace(ext, "").split("/").slice(1);

  // index.js/index.ts maps to parent directory
  if (pathParts[pathParts.length - 1] === "index") {
    pathParts.pop();
  }

  if (pathParts.length === 0) {
    logger.log?.(`[SCHEMA]   computeEndpoint(${file}) → SKIP: empty path after processing`);
    return null;
  }

  const endpoint = pathParts.join("/");
  logger.log?.(`[SCHEMA]   computeEndpoint(${file}) → "${endpoint}"`);
  return endpoint;
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
      isAsync: e.isAsync,
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
 * @param {object} [options.logger] - Logger instance
 * @returns {ApeSchema}
 */
function generateSchema(controllersDir, options = {}) {
  // Update logger if provided
  if (options.logger) {
    setLogger(options.logger);
  }

  logger.log?.(`[SCHEMA] ========================================`);
  logger.log?.(`[SCHEMA] generateSchema() starting`);
  logger.log?.(`[SCHEMA]   controllersDir: ${controllersDir}`);

  const extensions = options.extensions
    ? options.extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`))
    : getSupportedExtensions();

  logger.log?.(`[SCHEMA]   extensions: [${extensions.join(', ')}]`);

  const files = getFilesFromDir(controllersDir, extensions);
  const endpoints = [];
  const warnings = [];
  let skippedCount = 0;
  let noSchemaCount = 0;

  logger.log?.(`[SCHEMA] Processing ${files.length} file(s)...`);

  for (const file of files) {
    logger.log?.(`[SCHEMA] ----------------------------------------`);
    logger.log?.(`[SCHEMA] Processing file: ${file}`);

    const endpoint = computeEndpoint(file);
    if (!endpoint) {
      skippedCount++;
      continue;
    }

    const fullPath = path.join(controllersDir, file);

    // Skip files that shouldn't be processed
    if (!shouldProcessFile(fullPath)) {
      logger.log?.(`[SCHEMA]   Skipping: shouldProcessFile() returned false`);
      skippedCount++;
      continue;
    }

    logger.log?.(`[SCHEMA]   Extracting schema from: ${fullPath}`);
    const schema = extractSchema(fullPath);
    logger.log?.(`[SCHEMA]   Extraction result: source=${schema.source}, hasInput=${!!schema.input}, hasOutput=${!!schema.output}`);

    if (!schema.input && !schema.output) {
      logger.warn?.(`[SCHEMA]   WARNING: No schema extracted for ${endpoint} (no input/output types)`);
      noSchemaCount++;
    }

    endpoints.push({
      path: endpoint,
      filePath: fullPath,
      line: schema.line || 1,
      column: 1,
      description: schema.description,
      input: schema.input,
      output: schema.output,
      isAsync: schema.isAsync,
      throws: schema.throws || [],
      schemaSource: schema.source,
    });

    // Check for reserved name conflicts in path segments
    const pathSegments = endpoint.split("/");
    for (const segment of pathSegments) {
      const conflictType = getConflictType(segment);
      if (conflictType) {
        const severity = getConflictSeverity(conflictType);
        const message = getConflictMessage(conflictType, segment);
        warnings.push({
          path: endpoint,
          segment,
          type: conflictType,
          severity,
          message,
        });
        if (severity === "error") {
          logger.error?.(`[SCHEMA]   ERROR: ${message}`);
        } else {
          logger.warn?.(`[SCHEMA]   WARNING: ${message}`);
        }
      }
    }

    logger.log?.(`[SCHEMA]   Endpoint "${endpoint}" added successfully`);
  }

  // Sort endpoints alphabetically for consistent output
  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const schema = {
    version: generateVersionHash(endpoints),
    timestamp: Date.now(),
    controllersDir,
    endpoints,
    channels: [], // TODO: Extract from publish() calls via static analysis
    warnings, // Reserved name conflicts
  };

  logger.log?.(`[SCHEMA] ========================================`);
  logger.log?.(`[SCHEMA] Generation complete:`);
  logger.log?.(`[SCHEMA]   Total files found: ${files.length}`);
  logger.log?.(`[SCHEMA]   Endpoints created: ${endpoints.length}`);
  logger.log?.(`[SCHEMA]   Files skipped: ${skippedCount}`);
  logger.log?.(`[SCHEMA]   No schema extracted: ${noSchemaCount}`);
  logger.log?.(`[SCHEMA]   Reserved name warnings: ${warnings.length}`);
  logger.log?.(`[SCHEMA]   Endpoints: [${endpoints.map(e => e.path).join(', ')}]`);
  logger.log?.(`[SCHEMA] ========================================`);

  return schema;
}

module.exports = {
  generateSchema,
  computeEndpoint,
  getFilesFromDir,
  setLogger,
};
