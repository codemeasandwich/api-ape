/**
 * @fileoverview Reserved Name Detection for api-ape
 *
 * Identifies endpoint names that conflict with JavaScript/TypeScript built-ins
 * or api-ape proxy reserved properties.
 */

/**
 * Reserved names organized by category
 */
const RESERVED_NAMES = {
  // Proxy-reserved (runtime conflict - endpoint will NOT work)
  proxyReserved: new Set([
    "on",
    "onConnectionChange",
    "transport",
    "connect",
    "close",
    "then",
    "catch",
  ]),

  // Function.prototype (type conflict - fixed by callable syntax)
  functionPrototype: new Set([
    "name",
    "length",
    "constructor",
    "toString",
    "valueOf",
    "call",
    "apply",
    "bind",
    "prototype",
    "arguments",
    "caller",
  ]),

  // Object.prototype (type conflict)
  objectPrototype: new Set([
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "__proto__",
  ]),

  // Promise methods (conflict if used in chain)
  promiseMethods: new Set(["then", "catch", "finally"]),

  // JavaScript reserved words
  jsReserved: new Set([
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]),

  // TypeScript reserved (additional)
  tsReserved: new Set([
    "type",
    "interface",
    "namespace",
    "module",
    "declare",
    "enum",
    "implements",
    "private",
    "protected",
    "public",
    "readonly",
    "abstract",
    "as",
    "async",
    "await",
    "any",
    "boolean",
    "number",
    "string",
    "symbol",
    "never",
    "unknown",
    "object",
    "keyof",
    "infer",
  ]),
};

/**
 * Regex for valid JavaScript identifiers
 */
const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Check if name is a proxy-reserved property (runtime conflict)
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isProxyReserved(name) {
  return RESERVED_NAMES.proxyReserved.has(name);
}

/**
 * Check if name conflicts with Function.prototype
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isFunctionPrototype(name) {
  return RESERVED_NAMES.functionPrototype.has(name);
}

/**
 * Check if name conflicts with Object.prototype
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isObjectPrototype(name) {
  return RESERVED_NAMES.objectPrototype.has(name);
}

/**
 * Check if name is a JavaScript reserved word
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isJsReserved(name) {
  return RESERVED_NAMES.jsReserved.has(name);
}

/**
 * Check if name is a TypeScript reserved word
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isTsReserved(name) {
  return RESERVED_NAMES.tsReserved.has(name);
}

/**
 * Check if name is a valid JavaScript identifier
 * @param {string} name - The name to check
 * @returns {boolean}
 */
function isValidIdentifier(name) {
  if (!name || typeof name !== "string") return false;
  return VALID_IDENTIFIER.test(name);
}

/**
 * Sanitize a name to be a valid JavaScript identifier
 * @param {string} name - The name to sanitize
 * @returns {string} A valid identifier
 */
function sanitizeIdentifier(name) {
  if (!name || typeof name !== "string") return "_";

  let sanitized = name;

  // Handle hyphens: user-profile → userProfile
  sanitized = sanitized.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());

  // Handle remaining hyphens (e.g., trailing or double)
  sanitized = sanitized.replace(/-/g, "_");

  // Handle leading numbers: 2fa → _2fa
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  // Handle other invalid chars: replace with underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9_$]/g, "_");

  // Handle empty result
  if (!sanitized) {
    sanitized = "_";
  }

  // Handle if it starts with a number after sanitization
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  return sanitized;
}

/**
 * Conflict types returned by getConflictType
 * @typedef {'proxyReserved' | 'functionPrototype' | 'objectPrototype' | 'promiseMethod' | 'jsReserved' | 'tsReserved' | null} ConflictType
 */

/**
 * Get the conflict type for a name, or null if no conflict
 * Returns the most severe conflict type (proxy > prototype > reserved)
 *
 * @param {string} name - The name to check
 * @returns {ConflictType}
 */
function getConflictType(name) {
  if (!name || typeof name !== "string") return null;

  // Most severe: proxy reserved (runtime break)
  if (RESERVED_NAMES.proxyReserved.has(name)) {
    return "proxyReserved";
  }

  // Function prototype (type conflict, but handled)
  if (RESERVED_NAMES.functionPrototype.has(name)) {
    return "functionPrototype";
  }

  // Object prototype (type conflict)
  if (RESERVED_NAMES.objectPrototype.has(name)) {
    return "objectPrototype";
  }

  // Promise methods (already in proxyReserved, but check for 'finally')
  if (RESERVED_NAMES.promiseMethods.has(name)) {
    return "promiseMethod";
  }

  // JS reserved words
  if (RESERVED_NAMES.jsReserved.has(name)) {
    return "jsReserved";
  }

  // TS reserved words
  if (RESERVED_NAMES.tsReserved.has(name)) {
    return "tsReserved";
  }

  return null;
}

/**
 * Get a human-readable warning message for a conflict
 *
 * @param {ConflictType} conflictType - The type of conflict
 * @param {string} name - The conflicting name
 * @returns {string} Warning message
 */
function getConflictMessage(conflictType, name) {
  switch (conflictType) {
    case "proxyReserved":
      return `Endpoint "${name}" conflicts with reserved api-ape proxy method. This endpoint will NOT be callable at runtime.`;
    case "functionPrototype":
      return `Endpoint "${name}" shadows Function.prototype.${name}. Types use callable syntax to handle this.`;
    case "objectPrototype":
      return `Endpoint "${name}" shadows Object.prototype.${name}.`;
    case "promiseMethod":
      return `Endpoint "${name}" conflicts with Promise.prototype.${name}. This may cause issues with promise chaining.`;
    case "jsReserved":
      return `Endpoint "${name}" uses a JavaScript reserved word.`;
    case "tsReserved":
      return `Endpoint "${name}" uses a TypeScript reserved word.`;
    default:
      return "";
  }
}

/**
 * Get the severity level for a conflict type
 *
 * @param {ConflictType} conflictType - The type of conflict
 * @returns {'error' | 'warning' | null}
 */
function getConflictSeverity(conflictType) {
  switch (conflictType) {
    case "proxyReserved":
      return "error";
    case "functionPrototype":
    case "objectPrototype":
    case "promiseMethod":
    case "jsReserved":
    case "tsReserved":
      return "warning";
    default:
      return null;
  }
}

module.exports = {
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
