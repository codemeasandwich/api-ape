/**
 * @file JSDoc parser utilities for extracting and parsing documentation
 */

/**
 * Extracts JSDoc block ending at the given line index
 * @param {string[]} lines - Array of file lines
 * @param {number} endLine - Line index where JSDoc ends
 * @returns {{ text: string, startLine: number, endLine: number } | null}
 */
function extractJSDocBefore(lines, endLine) {
  let i = endLine;
  while (i >= 0 && !lines[i].includes("/**")) {
    i--;
  }
  if (i < 0) return null;

  const text = lines.slice(i, endLine + 1).join("\n");
  if (!text.includes("/**") || !text.includes("*/")) return null;

  return { text, startLine: i + 1, endLine: endLine + 1 };
}

/**
 * Parses @param tags from JSDoc text
 * @param {string} jsdoc - The JSDoc block text
 * @returns {string[]} Array of parameter names
 */
function parseParams(jsdoc) {
  const params = [];
  const lines = jsdoc.split("\n");

  for (const line of lines) {
    const paramMatch = line.match(/@param\s+\{/);
    if (!paramMatch) continue;

    // Find the matching closing brace by tracking depth
    const startIdx = line.indexOf("{", paramMatch.index);
    let depth = 1;
    let i = startIdx + 1;

    while (i < line.length && depth > 0) {
      if (line[i] === "{") depth++;
      else if (line[i] === "}") depth--;
      i++;
    }

    if (depth !== 0) continue;

    // Extract param name after the type
    const afterType = line.slice(i).trim();
    const nameMatch = afterType.match(/^(\[?\w+\]?)/);
    if (nameMatch && nameMatch[1]) {
      params.push(nameMatch[1].replace(/^\[|\]$/g, ""));
    }
  }

  return params;
}

/**
 * Checks if JSDoc has @returns or @return tag
 * @param {string} jsdoc - The JSDoc block text
 * @returns {boolean}
 */
function hasReturnsTag(jsdoc) {
  return /@returns?\s/.test(jsdoc);
}

/**
 * Extracts parameter name from a parameter declaration
 * @param {string} param - Parameter string (may include default, destructuring)
 * @returns {string | null} The parameter name
 */
function extractParamName(param) {
  if (!param) return null;

  // Rest parameter: ...args
  if (param.startsWith("...")) {
    return param.slice(3).split("=")[0].trim();
  }

  // Destructured parameter: { a, b } or [a, b]
  // Skip validation for destructured params
  if (param.startsWith("{") || param.startsWith("[")) {
    return null;
  }

  // Regular parameter: name or name = default
  return param.split("=")[0].trim();
}

/**
 * Parses function parameters from a function signature
 * @param {string} signature - The function signature string
 * @returns {string[]} Array of parameter names
 */
function parseFunctionParams(signature) {
  const match = signature.match(/\(([^)]*)\)/);
  if (!match) return [];

  const paramsStr = match[1].trim();
  if (!paramsStr) return [];

  const params = [];
  let depth = 0;
  let current = "";

  for (const char of paramsStr) {
    if (char === "{" || char === "[" || char === "(") depth++;
    else if (char === "}" || char === "]" || char === ")") depth--;
    else if (char === "," && depth === 0) {
      const param = extractParamName(current.trim());
      if (param) params.push(param);
      current = "";
      continue;
    }
    current += char;
  }

  const lastParam = extractParamName(current.trim());
  if (lastParam) params.push(lastParam);

  return params;
}

module.exports = {
  extractJSDocBefore,
  parseParams,
  hasReturnsTag,
  extractParamName,
  parseFunctionParams,
};
