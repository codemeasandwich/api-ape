/**
 * @fileoverview Schema Generator for api-ape
 *
 * This module extracts endpoint metadata from api-ape controller files,
 * including JSDoc documentation, parameter types, and return types.
 *
 * @module @api-ape/schema
 */

const { parseJSDoc } = require("./jsdoc-parser");
const { generateSchema } = require("./generator");
const { generateTypeDeclarations } = require("./type-generator");

module.exports = {
  parseJSDoc,
  generateSchema,
  generateTypeDeclarations,
};
