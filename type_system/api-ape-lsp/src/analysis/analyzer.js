/**
 * @fileoverview Document Analyzer for api-ape LSP
 *
 * Analyzes source code to find api-ape proxy chain patterns
 * and provide diagnostics for invalid endpoints.
 */

const { DiagnosticSeverity } = require("vscode-languageserver/node");
const { findSimilarEndpoints } = require("../utils/stringUtils");
const {
  parseObjectProperties,
  positionFromOffset,
  getRequiredParams,
} = require("../utils/documentUtils");

/**
 * Regex to match api-ape proxy chain patterns
 * Matches: api.users.profile, api.chat, etc.
 */
const API_CHAIN_REGEX = /\bapi\.([a-zA-Z_][\w.]*?)(?:\s*\(|\s*$)/g;

/**
 * Regex to match api-ape calls with arguments
 * Captures: endpoint path and the argument object
 */
const API_CALL_WITH_ARGS_REGEX = /\bapi\.([a-zA-Z_][\w.]*?)\s*\(\s*(\{[^}]*\})/g;

/**
 * Extract all api-ape calls from document text
 *
 * @param {string} text - Document text
 * @returns {Array<{path: string, start: number, end: number}>}
 */
function extractApiCalls(text) {
  const calls = [];
  let match;

  // Reset regex state to avoid issues with global regex reuse
  API_CHAIN_REGEX.lastIndex = 0;

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
 * Extract api-ape calls with their arguments for parameter validation
 *
 * @param {string} text - Document text
 * @returns {Array<{path: string, args: string, callStart: number, argsStart: number, argsEnd: number}>}
 */
function extractApiCallsWithArgs(text) {
  const calls = [];
  let match;

  // Reset regex state
  API_CALL_WITH_ARGS_REGEX.lastIndex = 0;

  while ((match = API_CALL_WITH_ARGS_REGEX.exec(text)) !== null) {
    const chainPart = match[1];
    const argsStr = match[2];

    const endpointPath = chainPart.replace(/\./g, "/");
    const callStart = match.index;
    const argsStart = match.index + match[0].indexOf(argsStr);

    calls.push({
      path: endpointPath,
      args: argsStr,
      callStart,
      argsStart,
      argsEnd: argsStart + argsStr.length,
    });
  }

  return calls;
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
    // Find exact endpoint match
    const endpoint = schema.endpoints.find((e) => e.path === call.path);

    // Check if endpoint exists (exact or prefix match)
    const endpointExists = endpoint || schema.endpoints.some((e) => {
      return e.path.startsWith(call.path + "/");
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
        data: {
          type: "unknownEndpoint",
          invalidPath: call.path,
          suggestions: similar,
        },
      });
    } else if (endpoint?.deprecated) {
      // Warn about deprecated endpoints
      const startPos = positionFromOffset(text, call.start);
      const endPos = positionFromOffset(text, call.end);

      let message = `Endpoint '/${call.path}' is deprecated`;
      if (endpoint.deprecatedMessage) {
        message += `: ${endpoint.deprecatedMessage}`;
      }
      if (endpoint.replacement) {
        message += `. Use '/${endpoint.replacement}' instead.`;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: startPos,
          end: endPos,
        },
        message,
        source: "api-ape",
        tags: [1], // DiagnosticTag.Deprecated
        data: {
          type: "deprecatedEndpoint",
          path: call.path,
          replacement: endpoint.replacement,
        },
      });
    }
  }

  // Validate parameters for calls with arguments
  const callsWithArgs = extractApiCallsWithArgs(text);
  for (const call of callsWithArgs) {
    const endpoint = schema.endpoints.find((e) => e.path === call.path);
    if (!endpoint || !endpoint.input) continue;

    // Get required parameters from endpoint schema
    const requiredParams = getRequiredParams(endpoint.input);
    const providedParams = parseObjectProperties(call.args);

    // Check for missing required parameters
    const missingParams = requiredParams.filter((p) => !providedParams.includes(p));
    if (missingParams.length > 0) {
      const startPos = positionFromOffset(text, call.argsStart);
      const endPos = positionFromOffset(text, call.argsEnd);

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: startPos,
          end: endPos,
        },
        message: `Missing required parameter${missingParams.length > 1 ? "s" : ""}: ${missingParams.join(", ")}`,
        source: "api-ape",
        data: {
          type: "missingParams",
          path: call.path,
          missingParams,
        },
      });
    }

    // Check for unknown parameters (if endpoint has strict schema)
    if (endpoint.input.kind === "object" && endpoint.input.properties) {
      const knownParams = Object.keys(endpoint.input.properties);
      const unknownParams = providedParams.filter((p) => !knownParams.includes(p));

      if (unknownParams.length > 0) {
        const startPos = positionFromOffset(text, call.argsStart);
        const endPos = positionFromOffset(text, call.argsEnd);

        diagnostics.push({
          severity: DiagnosticSeverity.Information,
          range: {
            start: startPos,
            end: endPos,
          },
          message: `Unknown parameter${unknownParams.length > 1 ? "s" : ""}: ${unknownParams.join(", ")}`,
          source: "api-ape",
          data: {
            type: "unknownParams",
            path: call.path,
            unknownParams,
          },
        });
      }
    }
  }

  return diagnostics;
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
  extractApiCallsWithArgs,
  findApiChainAtPosition,
};
