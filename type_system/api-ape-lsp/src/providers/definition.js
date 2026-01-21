/**
 * @fileoverview Definition Provider for api-ape LSP
 *
 * Provides go-to-definition for api-ape proxy chains.
 */

const { URI } = require("vscode-uri");
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
  if (!endpoint || !endpoint.filePath) return null;

  // Convert file path to URI using vscode-uri for cross-platform support
  // This correctly handles Windows paths (file:///C:/...) and URL encoding
  const fileUri = URI.file(endpoint.filePath).toString();

  // Validate and normalize line number (must be >= 0)
  const lineNum = Math.max(0, (endpoint.line || 1) - 1);

  return {
    uri: fileUri,
    range: {
      start: { line: lineNum, character: 0 },
      end: { line: lineNum, character: 0 },
    },
  };
}

module.exports = { getDefinition };
