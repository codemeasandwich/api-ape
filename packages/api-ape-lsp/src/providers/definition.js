/**
 * @fileoverview Definition Provider for api-ape LSP
 *
 * Provides go-to-definition for api-ape proxy chains.
 */

const { findApiChainAtPosition } = require("../analysis/analyzer");

/**
 * Get definition location for the current position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @param {object} schema - The api-ape schema
 * @returns {Location | null}
 */
function getDefinition(document, position, schema) {
  const chain = findApiChainAtPosition(document, position);
  if (!chain) return null;

  // Find exact endpoint match
  const endpoint = schema.endpoints.find((e) => e.path === chain.path);
  if (!endpoint) return null;

  // Convert file path to URI
  const fileUri = `file://${endpoint.filePath}`;

  return {
    uri: fileUri,
    range: {
      start: { line: endpoint.line - 1, character: 0 },
      end: { line: endpoint.line - 1, character: 0 },
    },
  };
}

module.exports = { getDefinition };
