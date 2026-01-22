/**
 * @fileoverview Schema Generator for api-ape
 *
 * This module extracts endpoint metadata from api-ape controller files,
 * including JSDoc documentation, parameter types, and return types.
 *
 * @module @api-ape/schema
 */

const { parseJSDoc, parseTypeString } = require("./jsdoc-parser");
const { generateSchema } = require("./generator");
const { generateTypeDeclarations } = require("./type-generator");
const { extractSchema, getSupportedExtensions, shouldProcessFile } = require("./extractor");
const { extractSchemaFromExport, normalizeTypeDef } = require("./export-extractor");
const { extractSchemaFromTypeScript, findCompanionDts } = require("./typescript-extractor");
const {
  RESERVED_NAMES,
  isProxyReserved,
  isFunctionPrototype,
  isObjectPrototype,
  isJsReserved,
  isTsReserved,
  isValidIdentifier,
  sanitizeIdentifier,
  getConflictType,
  getConflictMessage,
  getConflictSeverity,
} = require("./reserved-names");

module.exports = {
  parseJSDoc,
  parseTypeString,
  generateSchema,
  generateTypeDeclarations,
  extractSchema,
  getSupportedExtensions,
  shouldProcessFile,
  extractSchemaFromExport,
  normalizeTypeDef,
  extractSchemaFromTypeScript,
  findCompanionDts,
  // Reserved name utilities
  RESERVED_NAMES,
  isProxyReserved,
  isFunctionPrototype,
  isObjectPrototype,
  isJsReserved,
  isTsReserved,
  isValidIdentifier,
  sanitizeIdentifier,
  getConflictType,
  getConflictMessage,
  getConflictSeverity,
};
