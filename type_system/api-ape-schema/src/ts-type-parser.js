/**
 * @fileoverview Lightweight TypeScript Type Parser for api-ape
 *
 * Parses TypeScript inline types from function signatures without requiring
 * the TypeScript compiler. Uses regex and string parsing to extract input
 * and output types from exported functions.
 *
 * @example
 * // Parses this:
 * module.exports = function(data: { user: string }): { result: boolean } { ... }
 *
 * // Returns:
 * // {
 * //   input: { kind: 'object', properties: { user: { kind: 'primitive', name: 'string' } } },
 * //   output: { kind: 'object', properties: { result: { kind: 'primitive', name: 'boolean' } } }
 * // }
 */

const fs = require("fs");
const { findMatchingBracket, splitByComma } = require("./ts-type-parser-utils");
const { parseType } = require("./ts-type-parser-core");

/** @type {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} */
let logger = console;

/**
 * Set the logger for the parser
 * @param {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} l
 */
function setLogger(l) {
  logger = l || console;
}

/**
 * Extract function signature from TypeScript file content
 *
 * Finds the main export (module.exports or export default) and extracts
 * the function signature including parameters and return type.
 *
 * @param {string} content - File content
 * @returns {{params: string, returnType: string, line: number}|null}
 */
function extractFunctionSignature(content) {
  // Remove single-line comments (but preserve line count)
  const noSingleLineComments = content.replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));
  // Remove multi-line comments
  const noComments = noSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " ")
  );

  // Patterns to find the start of exported functions (capture up to opening paren)
  const patterns = [
    /module\.exports\s*=\s*(async\s+)?function\s*\w*\s*\(/,
    /module\.exports\s*=\s*(async\s+)?\(/,
    /export\s+default\s+(async\s+)?function\s*\w*\s*\(/,
    /export\s+default\s+(async\s+)?\(/,
  ];

  for (const pattern of patterns) {
    const match = noComments.match(pattern);
    if (match) {
      const isAsync = !!match[1];
      const line = content.slice(0, match.index).split("\n").length;
      const openParenIdx = match.index + match[0].length - 1;
      const closeParenIdx = findMatchingBracket(noComments, openParenIdx, "(", ")");
      if (closeParenIdx === -1) continue;

      const params = noComments.slice(openParenIdx + 1, closeParenIdx);
      const afterParen = noComments.slice(closeParenIdx + 1);
      const returnTypeMatch = afterParen.match(/^\s*:\s*/);

      let returnType = null;
      if (returnTypeMatch) {
        const returnTypeStart = closeParenIdx + 1 + returnTypeMatch[0].length;
        returnType = extractReturnTypeFromPosition(noComments, returnTypeStart);
      }

      return { params: params || "", returnType, line, isAsync };
    }
  }

  return null;
}

/**
 * Extract return type starting from a given position
 *
 * @param {string} content - Full content string
 * @param {number} start - Start position of the return type
 * @returns {string|null} Extracted return type
 */
function extractReturnTypeFromPosition(content, start) {
  let depth = 0;
  let i = start;
  let result = "";

  while (i < content.length) {
    const char = content[i];

    if (depth === 0) {
      if (char === "=" && i + 1 < content.length && content[i + 1] === ">") {
        break;
      }
      if (char === "{" && result.trim() && !result.trim().endsWith(":")) {
        const trimmed = result.trim();
        if (trimmed && !trimmed.endsWith("|") && !trimmed.endsWith("&") && !trimmed.endsWith(":")) {
          break;
        }
      }
    }

    if (char === "<" || char === "(" || char === "[" || char === "{") {
      depth++;
      result += char;
    } else if (char === ">" || char === ")" || char === "]" || char === "}") {
      depth--;
      if (depth < 0) break;
      result += char;
    } else if (char === "\n" && depth === 0) {
      const rest = content.slice(i + 1).match(/^\s*(\S)/);
      if (rest && ["|", "&", "<", "["].includes(rest[1])) {
        result += char;
      } else {
        break;
      }
    } else {
      result += char;
    }
    i++;
  }

  const trimmed = result.trim();
  return trimmed || null;
}

/**
 * Parse function parameters into an input type
 *
 * @param {string} paramsStr - Parameter string (without parentheses)
 * @returns {Object|null} Input type or null if no typed params
 */
function parseParams(paramsStr) {
  if (!paramsStr.trim()) return null;

  const params = splitByComma(paramsStr);
  const dataParams = params.filter((p) => !p.trim().startsWith("this:"));
  if (dataParams.length === 0) return null;

  if (dataParams.length === 1) {
    const param = dataParams[0].trim();
    const colonIdx = param.indexOf(":");
    if (colonIdx === -1) return { kind: "any", raw: param };
    return parseType(param.slice(colonIdx + 1).trim());
  }

  const properties = {};
  for (const param of dataParams) {
    const match = param.trim().match(/^(\w+)(\??):\s*(.+)$/);
    if (match) {
      const [, name, optional, typeStr] = match;
      const parsed = parseType(typeStr);
      if (optional) parsed.optional = true;
      properties[name] = parsed;
    }
  }

  return Object.keys(properties).length > 0 ? { kind: "object", properties } : null;
}

/**
 * Extract schema from TypeScript file using lightweight parsing
 *
 * @param {string} filePath - Path to the TypeScript file
 * @returns {ExtractedSchema|null} Schema with input/output types, or null
 *
 * @typedef {object} ExtractedSchema
 * @property {Object|null} input - Input parameter type
 * @property {Object|null} output - Return type
 * @property {number} line - Line number of the export
 * @property {'ts-parser'} source - Always 'ts-parser' for this extractor
 */
function extractSchemaFromTsTypes(filePath) {
  logger.log?.(`[TS-PARSER] extractSchemaFromTsTypes() for: ${filePath}`);

  if (!filePath.endsWith(".ts")) {
    logger.log?.(`[TS-PARSER]   Skipping: not a .ts file`);
    return null;
  }

  if (!fs.existsSync(filePath)) {
    logger.warn?.(`[TS-PARSER]   File does not exist: ${filePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    logger.log?.(`[TS-PARSER]   File read, ${content.length} bytes`);

    const sig = extractFunctionSignature(content);
    if (!sig) {
      logger.log?.(`[TS-PARSER]   No function export found`);
      return null;
    }

    logger.log?.(`[TS-PARSER]   Found signature at line ${sig.line}`);
    logger.log?.(`[TS-PARSER]   Params: ${sig.params}`);
    logger.log?.(`[TS-PARSER]   Return type: ${sig.returnType}`);

    const input = parseParams(sig.params);
    const returnsPromise = sig.returnType && /^Promise\s*</.test(sig.returnType.trim());
    const isAsync = sig.isAsync || returnsPromise;
    const output = sig.returnType ? parseType(sig.returnType) : null;

    logger.log?.(`[TS-PARSER]   Extracted input: ${input ? input.kind : "null"}`);
    logger.log?.(`[TS-PARSER]   Extracted output: ${output ? output.kind : "null"}`);
    logger.log?.(`[TS-PARSER]   isAsync: ${isAsync}`);

    return { input, output, isAsync, line: sig.line, source: "ts-parser" };
  } catch (err) {
    logger.error?.(`[TS-PARSER]   Error: ${err.message}`);
    return null;
  }
}

/**
 * Parse a type string (exported for testing)
 * @param {string} typeStr - TypeScript type string to parse
 * @returns {Object} Parsed type object
 */
function parseTypeString(typeStr) {
  return parseType(typeStr);
}

module.exports = {
  extractSchemaFromTsTypes,
  parseTypeString,
  parseType,
  setLogger,
};
