/**
 * @fileoverview Export-based Schema Extractor for api-ape
 *
 * Extracts schema from controllers that export a `schema` property
 * with input and/or output type definitions.
 *
 * @example
 * // Simple format
 * module.exports.schema = {
 *   input: { userId: { type: 'string', required: true } },
 *   output: { name: 'string', email: 'string' }
 * }
 *
 * @example
 * // Full TypeDefinition format
 * module.exports.schema = {
 *   input: { kind: 'object', properties: { userId: { kind: 'primitive', name: 'string' } } },
 *   output: { kind: 'object', properties: { name: { kind: 'primitive', name: 'string' } } }
 * }
 */

const path = require("path");

/**
 * Normalize a simple type definition to the full TypeDefinition format
 *
 * Converts shorthand schema definitions to the canonical TypeDefinition format
 * used throughout the api-ape schema system.
 *
 * @param {object|string|null} def - Type definition in simple or full format
 * @returns {TypeDefinition|null} Normalized TypeDefinition or null if invalid
 *
 * @typedef {object} TypeDefinition
 * @property {'primitive'|'reference'|'object'|'array'|'union'|'promise'|'any'} kind - Type category
 * @property {string} [name] - Type name (for primitives and references)
 * @property {string} [raw] - Original type string
 * @property {boolean} [optional] - Whether the property is optional
 * @property {string} [description] - Property description
 * @property {Object<string, TypeDefinition>} [properties] - Object properties
 *
 * @example
 * // String shorthand
 * normalizeTypeDef('string');
 * // { kind: 'primitive', name: 'string', raw: 'string' }
 *
 * @example
 * // Reference type
 * normalizeTypeDef('Date');
 * // { kind: 'reference', name: 'Date', raw: 'Date' }
 *
 * @example
 * // Object with shorthand properties
 * normalizeTypeDef({ name: 'string', age: 'number' });
 * // { kind: 'object', properties: { name: {...}, age: {...} }, raw: 'object' }
 *
 * @example
 * // Object with explicit type/required
 * normalizeTypeDef({ email: { type: 'string', required: true } });
 * // { kind: 'object', properties: { email: { kind: 'primitive', name: 'string', optional: false } } }
 */
function normalizeTypeDef(def) {
  if (!def) return null;

  // Already a TypeDefinition with 'kind' property
  if (def.kind) return def;

  // String shorthand: 'string' -> { kind: 'primitive', name: 'string' }
  if (typeof def === "string") {
    const primitives = [
      "string",
      "number",
      "boolean",
      "null",
      "undefined",
      "void",
      "any",
    ];
    if (primitives.includes(def.toLowerCase())) {
      return { kind: "primitive", name: def.toLowerCase(), raw: def };
    }
    // Treat as a reference type
    return { kind: "reference", name: def, raw: def };
  }

  // Object format: { propName: 'type' } or { propName: { type: 'string', required: true } }
  if (typeof def === "object" && !Array.isArray(def)) {
    const properties = {};

    for (const [key, value] of Object.entries(def)) {
      if (typeof value === "string") {
        // Simple string type
        properties[key] = normalizeTypeDef(value);
      } else if (value && typeof value === "object") {
        if (value.kind) {
          // Already a TypeDefinition
          properties[key] = value;
        } else if (value.type) {
          // Shorthand format: { type: 'string', required: true }
          properties[key] = {
            ...normalizeTypeDef(value.type),
            optional: value.required === false || !value.required,
          };
          if (value.description) {
            properties[key].description = value.description;
          }
        } else {
          // Nested object
          properties[key] = normalizeTypeDef(value);
        }
      }
    }

    return { kind: "object", properties, raw: "object" };
  }

  return null;
}

/**
 * Extract schema from a module's named schema export
 *
 * Loads a JavaScript module and checks for a `module.exports.schema` property.
 * If found, normalizes the schema to the canonical TypeDefinition format.
 *
 * @param {string} filePath - Absolute path to the controller file (must be .js)
 * @returns {ExportedSchema|null} Schema object with input/output, or null if not found
 *
 * @typedef {object} ExportedSchema
 * @property {TypeDefinition|null} input - Normalized input types
 * @property {TypeDefinition|null} output - Normalized output types
 * @property {'export'} source - Always 'export' for this extractor
 * @property {string} [description] - Endpoint description from schema
 * @property {string[]} [throws] - Error types from schema
 *
 * @example
 * // Controller with schema export
 * // module.exports.schema = { input: { id: 'string' }, output: { name: 'string' } }
 * const schema = extractSchemaFromExport('/api/users/get.js');
 * // { input: {...}, output: {...}, source: 'export' }
 *
 * @example
 * // Controller without schema export
 * const schema = extractSchemaFromExport('/api/users/list.js');
 * // null
 */
function extractSchemaFromExport(filePath) {
  // Only works for .js files
  if (!filePath.endsWith(".js")) {
    return null;
  }

  // Resolve the full path
  const fullPath = path.resolve(filePath);

  // Clear require cache to get fresh module
  try {
    delete require.cache[require.resolve(fullPath)];
  } catch {
    // Module not in cache, that's fine
  }

  try {
    const mod = require(fullPath);

    // Check for named schema export
    if (mod.schema && typeof mod.schema === "object") {
      const result = {
        input: normalizeTypeDef(mod.schema.input),
        output: normalizeTypeDef(mod.schema.output),
        source: "export",
      };

      // Copy description if provided
      if (mod.schema.description) {
        result.description = mod.schema.description;
      }

      // Copy throws if provided
      if (Array.isArray(mod.schema.throws)) {
        result.throws = mod.schema.throws;
      }

      return result;
    }

    return null;
  } catch (err) {
    // File might have syntax errors or require issues
    // Fall back to other extraction methods
    return null;
  }
}

module.exports = {
  extractSchemaFromExport,
  normalizeTypeDef,
};
