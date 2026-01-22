/**
 * @fileoverview Utility functions for TypeScript type parsing
 *
 * Helper functions for string manipulation and bracket matching.
 */

/**
 * Find matching bracket/brace/paren accounting for nesting
 *
 * @param {string} str - String to search
 * @param {number} start - Starting index (at the opening bracket)
 * @param {string} open - Opening character (e.g., '{', '[', '(', '<')
 * @param {string} close - Closing character (e.g., '}', ']', ')', '>')
 * @returns {number} Index of the matching closing bracket, or -1 if not found
 */
function findMatchingBracket(str, start, open, close) {
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = start; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle string literals (skip their contents)
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }

    if (inString) continue;

    if (char === open) {
      depth++;
    } else if (char === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Split a type string by an operator (| or &) respecting nesting
 *
 * @param {string} str - Type string
 * @param {string} operator - Operator to split by ('|' or '&')
 * @returns {string[]} Array of parts
 */
function splitByOperator(str, operator) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
      current += char;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    // Track nesting
    if (char === "{" || char === "(" || char === "[" || char === "<") {
      depth++;
      current += char;
    } else if (char === "}" || char === ")" || char === "]" || char === ">") {
      depth--;
      current += char;
    } else if (char === operator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Split by comma respecting nesting
 *
 * @param {string} str - String to split
 * @returns {string[]} Array of parts
 */
function splitByComma(str) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
      current += char;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    // Track nesting
    if (char === "{" || char === "(" || char === "[" || char === "<") {
      depth++;
      current += char;
    } else if (char === "}" || char === ")" || char === "]" || char === ">") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Split object properties by semicolon or comma, respecting nesting
 *
 * @param {string} str - Inner object content (without braces)
 * @returns {string[]} Array of property strings
 */
function splitProperties(str) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
      current += char;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    // Track nesting for objects, arrays, generics, and functions
    if (char === "{" || char === "(" || char === "[" || char === "<") {
      depth++;
      current += char;
    } else if (char === "}" || char === ")" || char === "]" || char === ">") {
      depth--;
      current += char;
    } else if ((char === ";" || char === ",") && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

module.exports = {
  findMatchingBracket,
  splitByOperator,
  splitByComma,
  splitProperties,
};
