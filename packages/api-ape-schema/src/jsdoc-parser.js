/**
 * @fileoverview JSDoc Parser for api-ape Controllers
 *
 * Extracts documentation and type information from JSDoc comments
 * in controller files.
 */

const { parse } = require("comment-parser");
const fs = require("fs");
const path = require("path");

/**
 * Parse a type string into a structured TypeDefinition
 *
 * @param {string} typeStr - The type string from JSDoc (e.g., "{string}", "{Object}")
 * @returns {TypeDefinition}
 */
function parseTypeString(typeStr) {
  if (!typeStr) return { kind: "any", raw: "any" };

  // Remove outer braces if present
  const cleaned = typeStr.replace(/^\{|\}$/g, "").trim();

  // Handle Promise<T>
  const promiseMatch = cleaned.match(/^Promise<(.+)>$/i);
  if (promiseMatch) {
    return {
      kind: "promise",
      resolves: parseTypeString(promiseMatch[1]),
      raw: cleaned,
    };
  }

  // Handle Array<T> or T[]
  const arrayMatch =
    cleaned.match(/^Array<(.+)>$/i) || cleaned.match(/^(.+)\[\]$/);
  if (arrayMatch) {
    return {
      kind: "array",
      items: parseTypeString(arrayMatch[1]),
      raw: cleaned,
    };
  }

  // Handle union types (A | B)
  if (cleaned.includes("|")) {
    const types = cleaned.split("|").map((t) => parseTypeString(t.trim()));
    return {
      kind: "union",
      types,
      raw: cleaned,
    };
  }

  // Handle object literal types { prop: type }
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return parseObjectType(cleaned);
  }

  // Primitive types
  const primitives = [
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "void",
    "any",
    "never",
  ];
  if (primitives.includes(cleaned.toLowerCase())) {
    return {
      kind: "primitive",
      name: cleaned.toLowerCase(),
      raw: cleaned,
    };
  }

  // Named type reference (e.g., "User", "Object")
  return {
    kind: "reference",
    name: cleaned,
    raw: cleaned,
  };
}

/**
 * Parse an object literal type from JSDoc
 *
 * @param {string} typeStr - Object type string like "{ name: string, age: number }"
 * @returns {TypeDefinition}
 */
function parseObjectType(typeStr) {
  const inner = typeStr.slice(1, -1).trim();
  if (!inner) {
    return { kind: "object", properties: {}, raw: typeStr };
  }

  const properties = {};
  // Simple property parsing - handles basic cases
  // For complex nested objects, we preserve the raw string
  const propMatches = inner.matchAll(
    /(\w+)(\?)?:\s*([^,}]+(?:\{[^}]*\})?)/g
  );

  for (const match of propMatches) {
    const [, name, optional, type] = match;
    properties[name] = {
      ...parseTypeString(type.trim()),
      optional: !!optional,
    };
  }

  return {
    kind: "object",
    properties,
    raw: typeStr,
  };
}

/**
 * Extract JSDoc information from a controller file
 *
 * @param {string} filePath - Absolute path to the controller file
 * @returns {ControllerDoc|null}
 */
function parseJSDoc(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Find the main JSDoc comment (the one before module.exports or export default)
  const exportPatterns = [
    /\/\*\*[\s\S]*?\*\/\s*(?=module\.exports\s*=)/,
    /\/\*\*[\s\S]*?\*\/\s*(?=export\s+default)/,
    /\/\*\*[\s\S]*?\*\/\s*(?=exports\s*=)/,
  ];

  let jsdocComment = null;
  let commentEndIndex = 0;

  for (const pattern of exportPatterns) {
    const match = content.match(pattern);
    if (match) {
      jsdocComment = match[0];
      commentEndIndex = match.index + match[0].length;
      break;
    }
  }

  // If no export-attached comment, look for the first JSDoc comment in the file
  if (!jsdocComment) {
    const firstComment = content.match(/\/\*\*[\s\S]*?\*\//);
    if (firstComment) {
      jsdocComment = firstComment[0];
      commentEndIndex = firstComment.index + firstComment[0].length;
    }
  }

  if (!jsdocComment) {
    return {
      filePath,
      description: null,
      input: null,
      output: null,
      throws: [],
      line: findExportLine(content),
    };
  }

  // Parse the JSDoc comment
  const parsed = parse(jsdocComment);
  if (!parsed || parsed.length === 0) {
    return {
      filePath,
      description: null,
      input: null,
      output: null,
      throws: [],
      line: findExportLine(content),
    };
  }

  const block = parsed[0];
  const description = block.description || null;

  // Extract @param tags - combine into input object type
  const paramTags = block.tags.filter((t) => t.tag === "param");
  let input = null;

  if (paramTags.length > 0) {
    // Check if we have a single "data" param with nested properties
    const dataParam = paramTags.find(
      (p) => p.name === "data" || p.name.startsWith("data.")
    );

    if (dataParam) {
      // Build object type from data.* params
      const properties = {};
      for (const param of paramTags) {
        if (param.name === "data") {
          // Top-level data param - use its type if it's an object
          if (param.type) {
            const parsed = parseTypeString(param.type);
            if (parsed.kind === "object" || parsed.kind === "reference") {
              input = parsed;
            }
          }
        } else if (param.name.startsWith("data.")) {
          // Nested property like data.userId
          const propName = param.name.slice(5); // Remove "data."
          properties[propName] = {
            ...parseTypeString(param.type),
            optional: param.optional,
            description: param.description || undefined,
          };
        }
      }

      // If we found nested properties, create object type
      if (Object.keys(properties).length > 0) {
        input = {
          kind: "object",
          properties,
          raw: "object",
        };
      }
    } else if (paramTags.length === 1) {
      // Single non-data param
      input = parseTypeString(paramTags[0].type);
      if (paramTags[0].description) {
        input.description = paramTags[0].description;
      }
    }
  }

  // Extract @returns tag
  const returnsTag = block.tags.find(
    (t) => t.tag === "returns" || t.tag === "return"
  );
  let output = null;
  if (returnsTag && returnsTag.type) {
    output = parseTypeString(returnsTag.type);
    if (returnsTag.description) {
      output.description = returnsTag.description;
    }
  }

  // Extract @throws tags
  const throwsTags = block.tags.filter(
    (t) => t.tag === "throws" || t.tag === "throw"
  );
  const throws = throwsTags.map((t) => {
    const errorType = t.type || "Error";
    const message = t.description || "";
    return `${errorType}: ${message}`.trim();
  });

  return {
    filePath,
    description,
    input,
    output,
    throws,
    line: findExportLine(content),
  };
}

/**
 * Find the line number of the export statement
 *
 * @param {string} content - File content
 * @returns {number} Line number (1-indexed)
 */
function findExportLine(content) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes("module.exports") ||
      lines[i].includes("export default") ||
      lines[i].match(/^exports\s*=/)
    ) {
      return i + 1;
    }
  }
  return 1;
}

module.exports = {
  parseJSDoc,
  parseTypeString,
};
