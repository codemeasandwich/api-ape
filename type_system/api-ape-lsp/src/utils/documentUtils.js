/**
 * @fileoverview Document Parsing Utilities for api-ape LSP
 *
 * Utilities for parsing document text and positions.
 */

/**
 * Parse a simple object literal to extract property names
 * This is a simplified parser that handles common cases
 *
 * @param {string} objStr - Object literal string like "{ foo: 1, bar: 'x' }"
 * @returns {string[]} Array of property names found
 */
function parseObjectProperties(objStr) {
  const properties = [];

  // Remove outer braces and whitespace
  const inner = objStr.slice(1, -1).trim();
  if (!inner) return properties;

  // Simple regex to find property names (handles most common cases)
  // Matches: foo:, "foo":, 'foo':, foo,
  // Using non-global regex with matchAll-like iteration for safety
  const propRegex = /(?:^|,)\s*(['"]?)(\w+)\1\s*(?::|,|$)/g;
  let match;

  // Reset before use to ensure clean state
  propRegex.lastIndex = 0;
  while ((match = propRegex.exec(inner)) !== null) {
    properties.push(match[2]);
  }

  // Also try shorthand property syntax: { foo, bar }
  const shorthandRegex = /(?:^|,)\s*(\w+)\s*(?:,|$)/g;
  shorthandRegex.lastIndex = 0;
  while ((match = shorthandRegex.exec(inner)) !== null) {
    if (!properties.includes(match[1])) {
      properties.push(match[1]);
    }
  }

  return properties;
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
 * Get required parameter names from an input type definition
 *
 * @param {object} inputType - Input type definition
 * @returns {string[]} Array of required parameter names
 */
function getRequiredParams(inputType) {
  if (!inputType || inputType.kind !== "object" || !inputType.properties) {
    return [];
  }

  return Object.entries(inputType.properties)
    .filter(([name, prop]) => prop.required !== false && !prop.optional)
    .map(([name]) => name);
}

module.exports = {
  parseObjectProperties,
  positionFromOffset,
  getRequiredParams,
};
