/**
 * @fileoverview Core type parsing functions for TypeScript type strings
 *
 * Parses TypeScript type strings into TypeDefinition objects.
 */

const {
  findMatchingBracket,
  splitByOperator,
  splitByComma,
  splitProperties,
} = require("./ts-type-parser-utils");

/**
 * Primitives that TypeScript recognizes
 */
const PRIMITIVES = [
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "void",
  "any",
  "unknown",
  "never",
  "object",
  "symbol",
  "bigint",
];

/**
 * Parse a type string into a TypeDefinition
 *
 * @param {string} typeStr - Type string to parse (e.g., "{ name: string }", "string[]")
 * @returns {TypeDefinition} Parsed type definition
 *
 * @typedef {object} TypeDefinition
 * @property {'primitive'|'object'|'array'|'union'|'intersection'|'reference'|'literal'|'record'|'any'} kind
 * @property {string} [name] - For primitives and references
 * @property {Object<string, TypeDefinition>} [properties] - For objects
 * @property {TypeDefinition} [items] - For arrays
 * @property {TypeDefinition[]} [types] - For unions and intersections
 * @property {*} [value] - For literals
 * @property {boolean} [optional] - If property is optional
 * @property {string} [raw] - Original type string
 */
function parseType(typeStr) {
  if (!typeStr) {
    return { kind: "any", raw: "any" };
  }

  // Trim and normalize whitespace
  typeStr = typeStr.trim();

  // Handle empty
  if (!typeStr) {
    return { kind: "any", raw: "" };
  }

  // Handle parenthesized types: (string | number)
  if (typeStr.startsWith("(") && typeStr.endsWith(")")) {
    const inner = typeStr.slice(1, -1);
    const closingIdx = findMatchingBracket(typeStr, 0, "(", ")");
    if (closingIdx === typeStr.length - 1) {
      return parseType(inner);
    }
  }

  // Handle Promise<T> - unwrap to get inner type
  const promiseMatch = typeStr.match(/^Promise\s*<(.+)>$/);
  if (promiseMatch) {
    return parseType(promiseMatch[1]);
  }

  // Handle Array<T>
  const arrayGenericMatch = typeStr.match(/^Array\s*<(.+)>$/);
  if (arrayGenericMatch) {
    return {
      kind: "array",
      items: parseType(arrayGenericMatch[1]),
      raw: typeStr,
    };
  }

  // Handle T[] array syntax (but not inside generics)
  if (typeStr.endsWith("[]")) {
    let bracketStart = typeStr.length - 2;
    let arrayDepth = 0;
    while (bracketStart >= 2 && typeStr.slice(bracketStart - 2, bracketStart) === "[]") {
      bracketStart -= 2;
      arrayDepth++;
    }

    const baseType = typeStr.slice(0, bracketStart);
    let result = parseType(baseType);
    for (let i = 0; i <= arrayDepth; i++) {
      result = { kind: "array", items: result, raw: typeStr };
    }
    return result;
  }

  // Handle union types: A | B | C
  const unionParts = splitByOperator(typeStr, "|");
  if (unionParts.length > 1) {
    return {
      kind: "union",
      types: unionParts.map((p) => parseType(p.trim())),
      raw: typeStr,
    };
  }

  // Handle intersection types: A & B & C
  const intersectionParts = splitByOperator(typeStr, "&");
  if (intersectionParts.length > 1) {
    return {
      kind: "intersection",
      types: intersectionParts.map((p) => parseType(p.trim())),
      raw: typeStr,
    };
  }

  // Handle object literals: { ... }
  if (typeStr.startsWith("{")) {
    const closingIdx = findMatchingBracket(typeStr, 0, "{", "}");
    if (closingIdx === typeStr.length - 1) {
      return parseObjectType(typeStr);
    }
  }

  // Handle tuple types: [string, number]
  if (typeStr.startsWith("[") && typeStr.endsWith("]")) {
    const inner = typeStr.slice(1, -1);
    const parts = splitByComma(inner);
    return {
      kind: "tuple",
      elements: parts.map((p) => parseType(p.trim())),
      raw: typeStr,
    };
  }

  // Handle string literals: 'value' or "value"
  if (
    (typeStr.startsWith("'") && typeStr.endsWith("'")) ||
    (typeStr.startsWith('"') && typeStr.endsWith('"'))
  ) {
    return {
      kind: "literal",
      value: typeStr.slice(1, -1),
      raw: typeStr,
    };
  }

  // Handle numeric literals
  if (/^-?\d+(\.\d+)?$/.test(typeStr)) {
    return {
      kind: "literal",
      value: parseFloat(typeStr),
      raw: typeStr,
    };
  }

  // Handle boolean literals
  if (typeStr === "true" || typeStr === "false") {
    return {
      kind: "literal",
      value: typeStr === "true",
      raw: typeStr,
    };
  }

  // Handle primitives
  if (PRIMITIVES.includes(typeStr)) {
    return {
      kind: "primitive",
      name: typeStr,
      raw: typeStr,
    };
  }

  // Handle template literal types: `${string}-id`
  if (typeStr.startsWith("`") && typeStr.endsWith("`")) {
    return {
      kind: "reference",
      name: typeStr,
      raw: typeStr,
    };
  }

  // Handle generic type references: Type<T>, Record<K, V>, etc.
  const genericMatch = typeStr.match(/^(\w+)\s*<(.+)>$/);
  if (genericMatch) {
    const [, name, args] = genericMatch;
    const typeArgs = splitByComma(args).map((a) => parseType(a.trim()));

    // Special handling for Record<K, V>
    if (name === "Record" && typeArgs.length === 2) {
      return {
        kind: "record",
        key: typeArgs[0],
        value: typeArgs[1],
        raw: typeStr,
      };
    }

    return {
      kind: "reference",
      name: name,
      typeArguments: typeArgs,
      raw: typeStr,
    };
  }

  // Handle simple type references: UserProfile, Result, etc.
  if (/^[A-Za-z_$][\w$]*$/.test(typeStr)) {
    return {
      kind: "reference",
      name: typeStr,
      raw: typeStr,
    };
  }

  // Fallback
  return {
    kind: "any",
    raw: typeStr,
  };
}

/**
 * Parse an object type literal: { prop: type; prop2?: type2 }
 *
 * @param {string} typeStr - Object type string including braces
 * @returns {TypeDefinition} Object type definition
 */
function parseObjectType(typeStr) {
  const inner = typeStr.slice(1, -1).trim();

  if (!inner) {
    return { kind: "object", properties: {}, raw: typeStr };
  }

  const properties = {};

  // Handle index signatures: [key: string]: type
  const indexSigMatch = inner.match(/^\s*\[\s*(\w+)\s*:\s*([^\]]+)\]\s*:\s*(.+)$/);
  if (indexSigMatch) {
    const [, , keyType, valueType] = indexSigMatch;
    return {
      kind: "record",
      key: parseType(keyType.trim()),
      value: parseType(valueType.trim()),
      raw: typeStr,
    };
  }

  const propStrings = splitProperties(inner);

  for (const propStr of propStrings) {
    const trimmed = propStr.trim();
    if (!trimmed) continue;

    // Handle readonly modifier
    let remaining = trimmed;
    if (remaining.startsWith("readonly ")) {
      remaining = remaining.slice(9).trim();
    }

    let propName;
    let typeStart;
    let isOptional = false;

    // Check for quoted property name
    const quotedMatch = remaining.match(/^(['"])([^'"]+)\1\s*(\??):\s*/);
    if (quotedMatch) {
      propName = quotedMatch[2];
      isOptional = quotedMatch[3] === "?";
      typeStart = quotedMatch[0].length;
    } else {
      const propMatch = remaining.match(/^(\w+)\s*(\??):\s*/);
      if (!propMatch) continue;
      propName = propMatch[1];
      isOptional = propMatch[2] === "?";
      typeStart = propMatch[0].length;
    }

    const propType = remaining.slice(typeStart);
    const parsed = parseType(propType);
    if (isOptional) {
      parsed.optional = true;
    }
    properties[propName] = parsed;
  }

  return { kind: "object", properties, raw: typeStr };
}

module.exports = {
  parseType,
  parseObjectType,
  PRIMITIVES,
};
