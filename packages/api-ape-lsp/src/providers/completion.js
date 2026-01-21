/**
 * @fileoverview Completion Provider for api-ape LSP
 *
 * Provides intelligent completions for api-ape proxy chains.
 */

const { CompletionItemKind, InsertTextFormat } = require("vscode-languageserver/node");

/**
 * Get completions for the current position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @param {object} schema - The api-ape schema
 * @returns {CompletionItem[]}
 */
function getCompletions(document, position, schema) {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // Get the text before cursor on this line
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineText = text.slice(lineStart, offset);

  // Check if we're in an api chain
  const apiChainMatch = lineText.match(/\bapi\.([\w.]*?)$/);
  if (!apiChainMatch) {
    // Not in an api chain - no completions
    return [];
  }

  const currentChain = apiChainMatch[1] || "";
  const currentPath = currentChain.replace(/\./g, "/");

  // Find matching endpoints
  const completions = [];
  const seenNamespaces = new Set();

  for (const endpoint of schema.endpoints) {
    // Check if endpoint matches current path prefix
    if (currentPath && !endpoint.path.startsWith(currentPath)) {
      continue;
    }

    // Get the remaining part after current path
    const remaining = currentPath
      ? endpoint.path.slice(currentPath.length).replace(/^\//, "")
      : endpoint.path;

    if (!remaining) {
      // Exact match - suggest calling the endpoint
      completions.push({
        label: "()",
        kind: CompletionItemKind.Method,
        detail: `Call /${endpoint.path}`,
        documentation: endpoint.description || `Endpoint: /${endpoint.path}`,
        insertText: "()",
        insertTextFormat: InsertTextFormat.PlainText,
        data: { endpointPath: endpoint.path },
      });
      continue;
    }

    // Get the next segment
    const parts = remaining.split("/");
    const nextSegment = parts[0];

    // If we've already seen this namespace, skip
    if (seenNamespaces.has(nextSegment)) continue;
    seenNamespaces.add(nextSegment);

    // Determine if this is a callable endpoint or a namespace
    const isEndpoint = parts.length === 1;
    const fullPath = currentPath
      ? `${currentPath}/${nextSegment}`
      : nextSegment;

    completions.push({
      label: nextSegment,
      kind: isEndpoint ? CompletionItemKind.Method : CompletionItemKind.Module,
      detail: isEndpoint ? `Endpoint: /${fullPath}` : `Namespace: /${fullPath}/...`,
      documentation: isEndpoint
        ? endpoint.description || `Call /${fullPath}`
        : `Access endpoints under /${fullPath}`,
      insertText: nextSegment,
      insertTextFormat: InsertTextFormat.PlainText,
      data: { endpointPath: fullPath, isNamespace: !isEndpoint },
    });
  }

  return completions;
}

/**
 * Resolve additional completion item details
 *
 * @param {CompletionItem} item - The completion item
 * @param {object} schema - The api-ape schema
 * @returns {CompletionItem}
 */
function resolveCompletion(item, schema) {
  if (!item.data || !item.data.endpointPath) return item;

  const endpoint = schema.endpoints.find(
    (e) => e.path === item.data.endpointPath
  );

  if (!endpoint) return item;

  // Build rich documentation
  const docParts = [];

  if (endpoint.description) {
    docParts.push(endpoint.description);
    docParts.push("");
  }

  docParts.push(`**Endpoint:** \`/${endpoint.path}\``);

  if (endpoint.input) {
    docParts.push("");
    docParts.push("**Input:**");
    docParts.push("```typescript");
    docParts.push(formatType(endpoint.input));
    docParts.push("```");
  }

  if (endpoint.output) {
    docParts.push("");
    docParts.push("**Returns:**");
    docParts.push("```typescript");
    docParts.push(formatType(endpoint.output));
    docParts.push("```");
  }

  if (endpoint.throws && endpoint.throws.length > 0) {
    docParts.push("");
    docParts.push("**Throws:**");
    for (const t of endpoint.throws) {
      docParts.push(`- ${t}`);
    }
  }

  item.documentation = {
    kind: "markdown",
    value: docParts.join("\n"),
  };

  return item;
}

/**
 * Format a type definition as a string
 *
 * @param {object} typeDef - Type definition object
 * @returns {string} Formatted type string
 */
function formatType(typeDef) {
  if (!typeDef) return "any";

  switch (typeDef.kind) {
    case "primitive":
      return typeDef.name;

    case "reference":
      return typeDef.name === "Object" ? "Record<string, any>" : typeDef.name;

    case "array":
      return `${formatType(typeDef.items)}[]`;

    case "union":
      return typeDef.types.map(formatType).join(" | ");

    case "promise":
      return `Promise<${formatType(typeDef.resolves)}>`;

    case "object":
      if (!typeDef.properties || Object.keys(typeDef.properties).length === 0) {
        return "Record<string, any>";
      }
      const props = Object.entries(typeDef.properties)
        .map(([name, prop]) => {
          const opt = prop.optional ? "?" : "";
          return `  ${name}${opt}: ${formatType(prop)}`;
        })
        .join(",\n");
      return `{\n${props}\n}`;

    default:
      return "any";
  }
}

module.exports = {
  getCompletions,
  resolveCompletion,
};
