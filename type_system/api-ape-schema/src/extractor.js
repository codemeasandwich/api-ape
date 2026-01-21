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
} = require("./typescript-extractor");
const { parseJSDoc } = require("./jsdoc-parser");

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

  // 1. Try named schema export (works for .js files)
  if (ext === ".js") {
    const exported = extractSchemaFromExport(filePath);
    if (exported && (exported.input || exported.output)) {
      // Get line number from JSDoc fallback if not provided
      if (!exported.line) {
        const jsdoc = parseJSDoc(filePath);
        exported.line = jsdoc.line;
      }
      return exported;
    }
  }

  // 2. Try TypeScript extraction (for .ts files)
  if (ext === ".ts") {
    const tsSchema = extractSchemaFromTypeScript(filePath);
    if (tsSchema && (tsSchema.input || tsSchema.output)) {
      return tsSchema;
    }
  }

  // 3. Check for companion .d.ts file (for .js files)
  if (ext === ".js") {
    const dtsPath = findCompanionDts(filePath);
    if (dtsPath) {
      const tsSchema = extractSchemaFromTypeScript(dtsPath);
      if (tsSchema && (tsSchema.input || tsSchema.output)) {
        // Use line from the .js file
        const jsdoc = parseJSDoc(filePath);
        tsSchema.line = jsdoc.line;
        tsSchema.source = "typescript";
        return tsSchema;
      }
    }
  }

  // 4. Fall back to JSDoc parsing
  const jsdoc = parseJSDoc(filePath);
  return {
    input: jsdoc.input,
    output: jsdoc.output,
    description: jsdoc.description,
    throws: jsdoc.throws || [],
    line: jsdoc.line,
    source: "jsdoc",
  };
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
    return false;
  }

  return getSupportedExtensions().includes(ext);
}

module.exports = {
  extractSchema,
  getSupportedExtensions,
  shouldProcessFile,
};
