/**
 * @fileoverview Document Analyzer for api-ape LSP
 *
 * Analyzes source code to find api-ape proxy chain patterns
 * and provide diagnostics for invalid endpoints.
 */

const { DiagnosticSeverity } = require("vscode-languageserver/node");

/**
 * Regex to match api-ape proxy chain patterns
 * Matches: api.users.profile, api.chat, etc.
 */
const API_CHAIN_REGEX = /\bapi\.([a-zA-Z_][\w.]*?)(?:\s*\(|\s*$)/g;

/**
 * Extract all api-ape calls from document text
 *
 * @param {string} text - Document text
 * @returns {Array<{path: string, start: number, end: number}>}
 */
function extractApiCalls(text) {
  const calls = [];
  let match;

  while ((match = API_CHAIN_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const chainPart = match[1];

    // Convert chain to endpoint path (users.profile -> users/profile)
    const endpointPath = chainPart.replace(/\./g, "/");

    calls.push({
      path: endpointPath,
      start: match.index + 4, // Skip "api."
      end: match.index + 4 + chainPart.length,
    });
  }

  return calls;
}

/**
 * Get position from offset in text
 *
 * @param {string} text - Document text
 * @param {number} offset - Character offset
 * @returns {{line: number, character: number}} Position object
 */
function positionFromOffset(text, offset) {
  let line = 0;
  let character = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return { line, character };
}

/**
 * Analyze document and return diagnostics
 *
 * @param {TextDocument} document - The document to analyze
 * @param {object} schema - The api-ape schema
 * @returns {Diagnostic[]}
 */
function analyzeDocument(document, schema) {
  const text = document.getText();
  const diagnostics = [];

  // Skip if not JavaScript/TypeScript
  const languageId = document.languageId;
  if (!["javascript", "typescript", "javascriptreact", "typescriptreact"].includes(languageId)) {
    return diagnostics;
  }

  const apiCalls = extractApiCalls(text);

  for (const call of apiCalls) {
    // Check if endpoint exists in schema
    const endpointExists = schema.endpoints.some((e) => {
      // Exact match or prefix match (for chained calls)
      return e.path === call.path || e.path.startsWith(call.path + "/");
    });

    if (!endpointExists) {
      // Find similar endpoints for suggestions
      const similar = findSimilarEndpoints(call.path, schema.endpoints);

      const startPos = positionFromOffset(text, call.start);
      const endPos = positionFromOffset(text, call.end);

      let message = `Unknown endpoint '/${call.path}'`;
      if (similar.length > 0) {
        message += `. Did you mean '/${similar[0]}'?`;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: startPos,
          end: endPos,
        },
        message,
        source: "api-ape",
      });
    }
  }

  return diagnostics;
}

/**
 * Find similar endpoints using Levenshtein distance
 *
 * @param {string} path - Endpoint path to match
 * @param {Array} endpoints - Array of endpoint objects
 * @returns {string[]} Array of similar endpoint paths
 */
function findSimilarEndpoints(path, endpoints) {
  const results = endpoints
    .map((e) => ({
      path: e.path,
      distance: levenshteinDistance(path, e.path),
    }))
    .filter((r) => r.distance <= 3) // Max 3 edits
    .sort((a, b) => a.distance - b.distance)
    .map((r) => r.path);

  return results.slice(0, 3);
}

/**
 * Calculate Levenshtein distance between two strings
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find the api chain at a specific position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @returns {{path: string, range: Range} | null}
 */
function findApiChainAtPosition(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // Find the line containing the position
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = text.indexOf("\n", offset);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const charInLine = offset - lineStart;

  // Find api chain in this line
  const apiMatch = line.match(/\bapi\.([a-zA-Z_][\w.]*)/);
  if (!apiMatch) return null;

  const chainStart = line.indexOf(apiMatch[0]);
  const chainEnd = chainStart + apiMatch[0].length;

  // Check if position is within the chain
  if (charInLine < chainStart || charInLine > chainEnd) return null;

  const chainPart = apiMatch[1];
  const endpointPath = chainPart.replace(/\./g, "/");

  return {
    path: endpointPath,
    range: {
      start: { line: position.line, character: chainStart + 4 },
      end: { line: position.line, character: chainEnd },
    },
  };
}

module.exports = {
  analyzeDocument,
  extractApiCalls,
  findApiChainAtPosition,
  findSimilarEndpoints,
};
