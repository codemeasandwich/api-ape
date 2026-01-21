/**
 * @fileoverview JSDoc Parser Module
 *
 * Extracts documentation and type information from JSDoc comments
 * in api-ape controller files.
 */

const fs = require("fs");

/**
 * Parse JSDoc from file content
 *
 * @param {string} filePath - Path to controller file
 * @returns {object} Parsed documentation
 */
function parseJSDoc(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const exportPatterns = [
    /\/\*\*[\s\S]*?\*\/\s*(?=module\.exports\s*=)/,
    /\/\*\*[\s\S]*?\*\/\s*(?=export\s+default)/,
  ];

  let jsdocComment = null;

  for (const pattern of exportPatterns) {
    const match = content.match(pattern);
    if (match) {
      jsdocComment = match[0];
      break;
    }
  }

  if (!jsdocComment) {
    const firstComment = content.match(/\/\*\*[\s\S]*?\*\//);
    if (firstComment) {
      jsdocComment = firstComment[0];
    }
  }

  const defaultResult = {
    filePath,
    description: null,
    input: null,
    output: null,
    throws: [],
    line: findExportLine(content),
  };

  if (!jsdocComment) return defaultResult;

  const block = parseJSDocBlock(jsdocComment);

  // Parse @param tags
  const paramTags = block.tags.filter((t) => t.tag === "param");
  let input = null;

  if (paramTags.length > 0) {
    const dataParams = paramTags.filter(
      (p) => p.name === "data" || (p.name && p.name.startsWith("data."))
    );

    if (dataParams.length > 0) {
      const properties = {};
      for (const param of dataParams) {
        if (param.name === "data" && param.type) {
          input = parseTypeString(param.type);
        } else if (param.name && param.name.startsWith("data.")) {
          const propName = param.name.slice(5);
          properties[propName] = {
            ...parseTypeString(param.type),
            optional: param.optional,
            description: param.description || undefined,
          };
        }
      }
      if (Object.keys(properties).length > 0) {
        input = { kind: "object", properties, raw: "object" };
      }
    }
  }

  // Parse @returns
  const returnsTag = block.tags.find(
    (t) => t.tag === "returns" || t.tag === "return"
  );
  let output = null;
  if (returnsTag && returnsTag.type) {
    output = parseTypeString(returnsTag.type);
  }

  // Parse @throws
  const throwsTags = block.tags.filter(
    (t) => t.tag === "throws" || t.tag === "throw"
  );
  const throws = throwsTags.map((t) => {
    const type = t.type || "Error";
    const msg = t.description || "";
    return `${type}: ${msg}`.trim();
  });

  return {
    filePath,
    description: block.description,
    input,
    output,
    throws,
    line: findExportLine(content),
  };
}

/**
 * Simple JSDoc block parser
 *
 * @param {string} comment - JSDoc comment string
 * @returns {object} Parsed block with description and tags
 */
function parseJSDocBlock(comment) {
  const lines = comment
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""));

  let description = "";
  const tags = [];
  let currentTag = null;

  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\s*(.*)/);

    if (tagMatch) {
      if (currentTag) tags.push(currentTag);

      const [, tagName, rest] = tagMatch;
      currentTag = { tag: tagName, raw: rest };

      if (tagName === "param") {
        const paramMatch = rest.match(
          /^\{([^}]+)\}\s*(\[)?(\w+(?:\.\w+)*)(\])?\s*(?:-\s*)?(.*)$/
        );
        if (paramMatch) {
          currentTag.type = paramMatch[1];
          currentTag.optional = !!(paramMatch[2] && paramMatch[4]);
          currentTag.name = paramMatch[3];
          currentTag.description = paramMatch[5] || "";
        }
      } else if (tagName === "returns" || tagName === "return") {
        const returnMatch = rest.match(/^\{([^}]+)\}\s*(.*)$/);
        if (returnMatch) {
          currentTag.type = returnMatch[1];
          currentTag.description = returnMatch[2] || "";
        }
      } else if (tagName === "throws" || tagName === "throw") {
        const throwMatch = rest.match(/^\{([^}]+)\}\s*(.*)$/);
        if (throwMatch) {
          currentTag.type = throwMatch[1];
          currentTag.description = throwMatch[2] || "";
        } else {
          currentTag.description = rest;
        }
      }
    } else if (currentTag) {
      currentTag.description =
        (currentTag.description || "") + " " + line.trim();
    } else {
      description += (description ? " " : "") + line.trim();
    }
  }

  if (currentTag) tags.push(currentTag);
  return { description: description.trim() || null, tags };
}

/**
 * Parse type string into TypeDefinition
 *
 * @param {string} typeStr - The type string from JSDoc
 * @returns {object} TypeDefinition object
 */
function parseTypeString(typeStr) {
  if (!typeStr) return { kind: "any", raw: "any" };

  const cleaned = typeStr.replace(/^\{|\}$/g, "").trim();

  const promiseMatch = cleaned.match(/^Promise<(.+)>$/i);
  if (promiseMatch) {
    return {
      kind: "promise",
      resolves: parseTypeString(promiseMatch[1]),
      raw: cleaned,
    };
  }

  const arrayMatch =
    cleaned.match(/^Array<(.+)>$/i) || cleaned.match(/^(.+)\[\]$/);
  if (arrayMatch) {
    return {
      kind: "array",
      items: parseTypeString(arrayMatch[1]),
      raw: cleaned,
    };
  }

  if (cleaned.includes("|")) {
    return {
      kind: "union",
      types: cleaned.split("|").map((t) => parseTypeString(t.trim())),
      raw: cleaned,
    };
  }

  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    const inner = cleaned.slice(1, -1).trim();
    if (!inner) return { kind: "object", properties: {}, raw: cleaned };

    const properties = {};
    const propMatches = inner.matchAll(/(\w+)(\?)?:\s*([^,}]+)/g);
    for (const match of propMatches) {
      const [, name, optional, type] = match;
      properties[name] = {
        ...parseTypeString(type.trim()),
        optional: !!optional,
      };
    }
    return { kind: "object", properties, raw: cleaned };
  }

  const primitives = [
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "void",
    "any",
  ];
  if (primitives.includes(cleaned.toLowerCase())) {
    return { kind: "primitive", name: cleaned.toLowerCase(), raw: cleaned };
  }

  return { kind: "reference", name: cleaned, raw: cleaned };
}

/**
 * Find export line number in file content
 *
 * @param {string} content - File content
 * @returns {number} Line number (1-indexed)
 */
function findExportLine(content) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes("module.exports") ||
      lines[i].includes("export default")
    ) {
      return i + 1;
    }
  }
  return 1;
}

module.exports = {
  parseJSDoc,
  parseJSDocBlock,
  parseTypeString,
  findExportLine,
};
