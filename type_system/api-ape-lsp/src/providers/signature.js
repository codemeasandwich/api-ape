/**
 * @fileoverview Signature Help Provider for api-ape LSP
 *
 * Provides parameter hints when typing api-ape endpoint calls.
 */

const { MarkupKind } = require("vscode-languageserver/node");
const { formatTypeForSignature } = require("../utils/typeFormatter");

/**
 * Get signature help for the current position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @param {object} schema - The api-ape schema
 * @returns {SignatureHelp|null}
 */
function getSignatureHelp(document, position, schema) {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // Find the start of the current line
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = text.indexOf("\n", offset);
  const lineText = text.slice(lineStart, lineEnd > -1 ? lineEnd : undefined);
  const cursorCol = offset - lineStart;

  // Look for api.xxx.yyy( pattern before cursor
  // We need to find the opening paren and extract the endpoint path
  const beforeCursor = lineText.slice(0, cursorCol);

  // Match api.path.to.endpoint( with cursor inside parentheses
  const match = beforeCursor.match(/\bapi\.([\w.]+)\(\s*(?:\{[^}]*)?$/);
  if (!match) {
    // Try matching without object literal (simple call)
    const simpleMatch = beforeCursor.match(/\bapi\.([\w.]+)\(\s*$/);
    if (!simpleMatch) {
      return null;
    }

    const endpointPath = simpleMatch[1].replace(/\./g, "/");
    const endpoint = schema.endpoints.find((e) => e.path === endpointPath);

    if (!endpoint) return null;

    return createSignatureHelp(endpoint);
  }

  const endpointPath = match[1].replace(/\./g, "/");
  const endpoint = schema.endpoints.find((e) => e.path === endpointPath);

  if (!endpoint) return null;

  // Determine which parameter we're on based on cursor position within the object
  const objectContent = beforeCursor.slice(beforeCursor.lastIndexOf("{") + 1);
  const activeParameter = countCommas(objectContent);

  return createSignatureHelp(endpoint, activeParameter);
}

/**
 * Count commas in a string (for determining active parameter)
 *
 * @param {string} str - String to count commas in
 * @returns {number}
 */
function countCommas(str) {
  let count = 0;
  let depth = 0;
  for (const char of str) {
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    else if (char === "," && depth === 0) count++;
  }
  return count;
}

/**
 * Create signature help response for an endpoint
 *
 * @param {object} endpoint - Endpoint definition
 * @param {number} [activeParameter=0] - Index of active parameter
 * @returns {SignatureHelp}
 */
function createSignatureHelp(endpoint, activeParameter = 0) {
  const parameters = [];
  const parameterDocs = [];

  // Build parameter list from input type
  if (endpoint.input && endpoint.input.kind === "object" && endpoint.input.properties) {
    for (const [name, prop] of Object.entries(endpoint.input.properties)) {
      const optional = prop.optional ? "?" : "";
      const typeStr = formatTypeForSignature(prop);
      parameters.push(`${name}${optional}: ${typeStr}`);

      // Build parameter documentation
      const docParts = [];
      if (prop.description) {
        docParts.push(prop.description);
      }
      docParts.push(`Type: \`${typeStr}\``);
      if (prop.required === false || prop.optional) {
        docParts.push("*(optional)*");
      }

      parameterDocs.push({
        label: name,
        documentation: {
          kind: MarkupKind.Markdown,
          value: docParts.join("\n\n"),
        },
      });
    }
  } else if (endpoint.input) {
    // Single parameter
    const typeStr = formatTypeForSignature(endpoint.input);
    parameters.push(`data: ${typeStr}`);
    parameterDocs.push({
      label: "data",
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Input data of type \`${typeStr}\``,
      },
    });
  }

  // Build the signature label
  const apiPath = `api.${endpoint.path.replace(/\//g, ".")}`;
  const paramsStr = parameters.length > 0 ? `{ ${parameters.join(", ")} }` : "";
  const returnType = endpoint.output ? formatTypeForSignature(endpoint.output) : "void";
  const label = `${apiPath}(${paramsStr}): Promise<${returnType}>`;

  // Build documentation
  const docParts = [];
  if (endpoint.description) {
    docParts.push(endpoint.description);
    docParts.push("");
  }
  docParts.push(`**Endpoint:** \`/${endpoint.path}\``);

  if (endpoint.throws && endpoint.throws.length > 0) {
    docParts.push("");
    docParts.push("**Throws:**");
    for (const t of endpoint.throws) {
      docParts.push(`- ${t}`);
    }
  }

  return {
    signatures: [
      {
        label,
        documentation: {
          kind: MarkupKind.Markdown,
          value: docParts.join("\n"),
        },
        parameters: parameterDocs,
      },
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, parameterDocs.length - 1),
  };
}

module.exports = {
  getSignatureHelp,
};
