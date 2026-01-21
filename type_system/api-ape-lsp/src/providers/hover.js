/**
 * @fileoverview Hover Provider for api-ape LSP
 *
 * Provides hover information for api-ape proxy chains.
 */

const { MarkupKind } = require("vscode-languageserver/node");
const { findApiChainAtPosition } = require("../analysis/analyzer");
const { formatTypeForHover } = require("../utils/typeFormatter");

/**
 * Get hover information for the current position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @param {object} schema - The api-ape schema
 * @returns {Hover | null}
 */
function getHover(document, position, schema) {
  const chain = findApiChainAtPosition(document, position);
  if (!chain) return null;

  // Find exact endpoint match
  const endpoint = schema.endpoints.find((e) => e.path === chain.path);

  if (!endpoint) {
    // Check if it's a namespace prefix
    const children = schema.endpoints.filter((e) =>
      e.path.startsWith(chain.path + "/")
    );

    if (children.length > 0) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: formatNamespaceHover(chain.path, children),
        },
        range: chain.range,
      };
    }

    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatEndpointHover(endpoint),
    },
    range: chain.range,
  };
}

/**
 * Format hover content for an endpoint
 *
 * @param {object} endpoint - Endpoint object from schema
 * @returns {string} Markdown formatted hover content
 */
function formatEndpointHover(endpoint) {
  const parts = [];

  parts.push(`### \`/${endpoint.path}\``);

  if (endpoint.description) {
    parts.push("");
    parts.push(endpoint.description);
  }

  if (endpoint.input) {
    parts.push("");
    parts.push("**Input:**");
    parts.push("```typescript");
    parts.push(formatTypeForHover(endpoint.input));
    parts.push("```");
  }

  if (endpoint.output) {
    parts.push("");
    parts.push("**Returns:**");
    parts.push("```typescript");
    parts.push(formatTypeForHover(endpoint.output));
    parts.push("```");
  }

  if (endpoint.throws && endpoint.throws.length > 0) {
    parts.push("");
    parts.push("**Throws:**");
    for (const t of endpoint.throws) {
      parts.push(`- ${t}`);
    }
  }

  parts.push("");
  parts.push(`*Source: ${endpoint.filePath}:${endpoint.line}*`);

  return parts.join("\n");
}

/**
 * Format hover content for a namespace
 *
 * @param {string} path - Namespace path
 * @param {Array} children - Child endpoints
 * @returns {string} Markdown formatted hover content
 */
function formatNamespaceHover(path, children) {
  const parts = [];

  parts.push(`### \`/${path}/\``);
  parts.push("");
  parts.push(`**Namespace** with ${children.length} endpoint(s):`);
  parts.push("");

  // List child endpoints (up to 10)
  const displayed = children.slice(0, 10);
  for (const child of displayed) {
    const relativePath = child.path.slice(path.length + 1);
    parts.push(`- \`${relativePath}\`${child.description ? ` - ${child.description}` : ""}`);
  }

  if (children.length > 10) {
    parts.push(`- *...and ${children.length - 10} more*`);
  }

  return parts.join("\n");
}

module.exports = { getHover };
