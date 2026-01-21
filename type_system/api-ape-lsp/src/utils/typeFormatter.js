/**
 * @fileoverview Type Formatter Utilities for api-ape LSP
 *
 * Shared utility for formatting TypeDefinition objects as TypeScript strings.
 * Used by completion, hover, and signature help providers.
 */

/**
 * @typedef {Object} FormatOptions
 * @property {'full' | 'abbreviated' | 'inline'} [mode='full'] - Formatting mode
 *   - 'full': Complete multiline object representation
 *   - 'abbreviated': Short form for objects (shows first 3 props + ...)
 *   - 'inline': Single line with descriptions as comments
 * @property {boolean} [includeDescriptions=false] - Include property descriptions as inline comments
 * @property {number} [indent=2] - Number of spaces for indentation
 */

/**
 * Format a type definition as a TypeScript string
 *
 * @param {object} typeDef - Type definition object from schema
 * @param {FormatOptions} [options={}] - Formatting options
 * @returns {string} Formatted type string
 *
 * @example
 * // Full format (default)
 * formatType({ kind: 'object', properties: { name: { kind: 'primitive', name: 'string' } } })
 * // Returns: "{\n  name: string\n}"
 *
 * @example
 * // Abbreviated format
 * formatType(typeDef, { mode: 'abbreviated' })
 * // Returns: "{ name, age, ... }"
 *
 * @example
 * // With descriptions
 * formatType(typeDef, { includeDescriptions: true })
 * // Returns: "{\n  name: string; // User's name\n}"
 */
function formatType(typeDef, options = {}) {
  const { mode = "full", includeDescriptions = false, indent = 2 } = options;

  if (!typeDef) return "any";

  switch (typeDef.kind) {
    case "primitive":
      return typeDef.name || "any";

    case "reference":
      // Convert 'Object' reference to Record<string, any> for better typing
      return typeDef.name === "Object" ? "Record<string, any>" : typeDef.name;

    case "array":
      // Handle both 'items' (standard) and 'elementType' (alternate) properties
      return `${formatType(typeDef.items || typeDef.elementType, options)}[]`;

    case "union":
      if (!typeDef.types || typeDef.types.length === 0) {
        return "any";
      }
      return typeDef.types.map((t) => formatType(t, options)).join(" | ");

    case "promise":
      // Handle both 'resolves' (standard) and 'resolvedType' (alternate) properties
      return `Promise<${formatType(typeDef.resolves || typeDef.resolvedType, options)}>`;

    case "literal":
      // Literal types: 'active', 42, etc.
      if (typeof typeDef.value === "string") {
        return `"${typeDef.value}"`;
      }
      return String(typeDef.value);

    case "record":
      // Index signature types: Record<K, V> or { [key: string]: V }
      const keyType = typeDef.key ? formatType(typeDef.key, options) : "string";
      const valueType = typeDef.value ? formatType(typeDef.value, options) : "any";
      return `Record<${keyType}, ${valueType}>`;

    case "object":
      return formatObjectType(typeDef, { mode, includeDescriptions, indent });

    case "any":
    default:
      return typeDef.name || "any";
  }
}

/**
 * Format an object type definition
 *
 * @param {object} typeDef - Object type definition
 * @param {FormatOptions} options - Formatting options
 * @returns {string}
 */
function formatObjectType(typeDef, options) {
  const { mode, includeDescriptions, indent } = options;

  if (!typeDef.properties || Object.keys(typeDef.properties).length === 0) {
    return mode === "abbreviated" ? "object" : "Record<string, any>";
  }

  const props = Object.entries(typeDef.properties);

  // Abbreviated mode: show first 3 property names only
  if (mode === "abbreviated") {
    const propNames = props.slice(0, 3).map(([name]) => name);
    const hasMore = props.length > 3;
    return `{ ${propNames.join(", ")}${hasMore ? ", ..." : ""} }`;
  }

  // Full or inline mode: show complete type structure
  const spaces = " ".repeat(indent);
  const formattedProps = props
    .map(([name, prop]) => {
      const opt = prop.optional ? "?" : "";
      const typeStr = formatType(prop, { ...options, mode: "full" });
      const separator = includeDescriptions ? ";" : ",";

      let line = `${spaces}${name}${opt}: ${typeStr}${separator}`;

      if (includeDescriptions && prop.description) {
        line += ` // ${prop.description}`;
      }

      return line;
    })
    .join("\n");

  return `{\n${formattedProps}\n}`;
}

/**
 * Format type for completion items
 * Uses full multiline format without descriptions
 *
 * @param {object} typeDef - Type definition
 * @returns {string}
 */
function formatTypeForCompletion(typeDef) {
  return formatType(typeDef, { mode: "full", includeDescriptions: false });
}

/**
 * Format type for hover information
 * Uses full multiline format with descriptions as comments
 *
 * @param {object} typeDef - Type definition
 * @returns {string}
 */
function formatTypeForHover(typeDef) {
  return formatType(typeDef, { mode: "full", includeDescriptions: true });
}

/**
 * Format type for signature help
 * Uses abbreviated format for compact display
 *
 * @param {object} typeDef - Type definition
 * @returns {string}
 */
function formatTypeForSignature(typeDef) {
  return formatType(typeDef, { mode: "abbreviated", includeDescriptions: false });
}

module.exports = {
  formatType,
  formatTypeForCompletion,
  formatTypeForHover,
  formatTypeForSignature,
};
