/**
 * @fileoverview Unified Schema Extractor for api-ape
 *
 * Combines multiple schema extraction methods with the following priority:
 * 1. Named schema export (module.exports.schema)
 * 2. TypeScript definitions (.ts files or companion .d.ts files)
 * 3. JSDoc comments (fallback)
 */

const fs = require("fs");
const path = require("path");
const { extractSchemaFromExport } = require("./export-extractor");
const {
  extractSchemaFromTypeScript,
  findCompanionDts,
  setLogger: setTsLogger,
} = require("./typescript-extractor");
const {
  extractSchemaFromTsTypes,
  setLogger: setTsParserLogger,
} = require("./ts-type-parser");
const { parseJSDoc } = require("./jsdoc-parser");

/** @type {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} */
let logger = console;

/**
 * Set the logger for extractor
 * @param {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} l
 */
function setLogger(l) {
  logger = l || console;
  // Propagate logger to extractors
  setTsLogger(l);
  setTsParserLogger(l);
}

/**
 * Extract schema from a controller file using all available methods
 *
 * Priority order:
 * 1. Named schema export (highest priority)
 * 2. TypeScript definitions
 * 3. JSDoc comments (lowest priority)
 *
 * @param {string} filePath - Absolute path to the controller file
 * @returns {ExtractedSchema} Schema object with input, output, description, throws, line, source
 *
 * @typedef {object} ExtractedSchema
 * @property {TypeDefinition|null} input - Input parameter types
 * @property {TypeDefinition|null} output - Return type
 * @property {string|null} [description] - Endpoint description
 * @property {string[]} [throws] - Error types that may be thrown
 * @property {number} line - Line number of the export statement
 * @property {'export'|'typescript'|'jsdoc'} source - Extraction method used
 *
 * @example
 * const schema = extractSchema('/path/to/api/users/profile.js');
 * console.log(schema.source); // 'export', 'typescript', or 'jsdoc'
 * console.log(schema.input);  // TypeDefinition or null
 */
function extractSchema(filePath) {
  const ext = path.extname(filePath);
  logger.log?.(`[EXTRACT] extractSchema() for: ${filePath}`);
  logger.log?.(`[EXTRACT]   Extension: ${ext}`);

  // 1. Try named schema export (works for .js files)
  if (ext === ".js") {
    logger.log?.(`[EXTRACT]   Trying method 1: Named schema export (.schema property)`);
    const exported = extractSchemaFromExport(filePath);
    if (exported && (exported.input || exported.output)) {
      logger.log?.(`[EXTRACT]   SUCCESS: Found named schema export`);
      // Get line number from JSDoc fallback if not provided
      if (!exported.line) {
        const jsdoc = parseJSDoc(filePath);
        exported.line = jsdoc.line;
      }
      logger.log?.(`[EXTRACT]   Result: source=${exported.source}, hasInput=${!!exported.input}, hasOutput=${!!exported.output}`);
      return exported;
    }
    logger.log?.(`[EXTRACT]   No named schema export found, trying next method...`);
  }

  // 2. Try TypeScript extraction (for .ts files)
  if (ext === ".ts") {
    // 2a. Try TypeScript compiler-based extraction first (requires TS installed)
    logger.log?.(`[EXTRACT]   Trying method 2a: TypeScript compiler extraction`);
    const tsSchema = extractSchemaFromTypeScript(filePath);
    if (tsSchema && (tsSchema.input || tsSchema.output)) {
      logger.log?.(`[EXTRACT]   SUCCESS: TypeScript compiler extraction worked`);
      logger.log?.(`[EXTRACT]   Result: source=${tsSchema.source}, hasInput=${!!tsSchema.input}, hasOutput=${!!tsSchema.output}`);
      return tsSchema;
    }
    logger.log?.(`[EXTRACT]   TypeScript compiler extraction returned no types, trying lightweight parser...`);

    // 2b. Fall back to lightweight regex-based parser (no TS compiler needed)
    logger.log?.(`[EXTRACT]   Trying method 2b: Lightweight TS type parser`);
    const lightSchema = extractSchemaFromTsTypes(filePath);
    if (lightSchema && (lightSchema.input || lightSchema.output)) {
      logger.log?.(`[EXTRACT]   SUCCESS: Lightweight TS parser worked`);
      logger.log?.(`[EXTRACT]   Result: source=${lightSchema.source}, hasInput=${!!lightSchema.input}, hasOutput=${!!lightSchema.output}`);
      return lightSchema;
    }
    logger.log?.(`[EXTRACT]   Lightweight TS parser returned no types, trying next method...`);
  }

  // 3. Check for companion .d.ts file (for .js files)
  if (ext === ".js") {
    logger.log?.(`[EXTRACT]   Trying method 3: Companion .d.ts file`);
    const dtsPath = findCompanionDts(filePath);
    if (dtsPath) {
      logger.log?.(`[EXTRACT]   Found companion .d.ts: ${dtsPath}`);
      const tsSchema = extractSchemaFromTypeScript(dtsPath);
      if (tsSchema && (tsSchema.input || tsSchema.output)) {
        logger.log?.(`[EXTRACT]   SUCCESS: Extracted types from companion .d.ts`);
        // Use line from the .js file
        const jsdoc = parseJSDoc(filePath);
        tsSchema.line = jsdoc.line;
        tsSchema.source = "typescript";
        logger.log?.(`[EXTRACT]   Result: source=${tsSchema.source}, hasInput=${!!tsSchema.input}, hasOutput=${!!tsSchema.output}`);
        return tsSchema;
      }
      logger.log?.(`[EXTRACT]   Companion .d.ts had no types, trying next method...`);
    } else {
      logger.log?.(`[EXTRACT]   No companion .d.ts file found`);
    }
  }

  // 4. Fall back to JSDoc parsing
  logger.log?.(`[EXTRACT]   Trying method 4: JSDoc parsing (fallback)`);
  const jsdoc = parseJSDoc(filePath);
  const result = {
    input: jsdoc.input,
    output: jsdoc.output,
    description: jsdoc.description,
    throws: jsdoc.throws || [],
    line: jsdoc.line,
    source: "jsdoc",
  };
  logger.log?.(`[EXTRACT]   Result: source=jsdoc, hasInput=${!!result.input}, hasOutput=${!!result.output}, description=${!!result.description}`);
  return result;
}

/**
 * Get supported file extensions for schema extraction
 *
 * @returns {string[]} Array of extensions with leading dots (e.g., ['.js', '.ts'])
 *
 * @example
 * const extensions = getSupportedExtensions();
 * // ['.js', '.ts']
 */
function getSupportedExtensions() {
  return [".js", ".ts"];
}

/**
 * Check if a file should be processed for schema extraction
 *
 * Skips `.d.ts` files (companion type definitions) and files with
 * unsupported extensions.
 *
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the file should be processed
 *
 * @example
 * shouldProcessFile('/api/users.js');     // true
 * shouldProcessFile('/api/users.ts');     // true
 * shouldProcessFile('/api/users.d.ts');   // false
 * shouldProcessFile('/api/users.json');   // false
 */
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);

  // Skip .d.ts files (they're companions, not controllers)
  if (filePath.endsWith(".d.ts")) {
    logger.log?.(`[EXTRACT] shouldProcessFile(${filePath}) → false: .d.ts companion file`);
    return false;
  }

  const supported = getSupportedExtensions();
  const result = supported.includes(ext);
  logger.log?.(`[EXTRACT] shouldProcessFile(${filePath}) → ${result}: ext=${ext}, supported=[${supported.join(', ')}]`);
  return result;
}

module.exports = {
  extractSchema,
  getSupportedExtensions,
  shouldProcessFile,
  setLogger,
};
