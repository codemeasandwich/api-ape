/**
 * @fileoverview Completion Provider for api-ape LSP
 *
 * Provides intelligent completions for api-ape proxy chains.
 */

const { CompletionItemKind, InsertTextFormat, TextEdit } = require("vscode-languageserver/node");

// Use Reference kind for api-ape endpoints to distinguish from regular methods
const API_APE_ENDPOINT_KIND = CompletionItemKind.Reference;
// Use Folder kind for api-ape namespaces
const API_APE_NAMESPACE_KIND = CompletionItemKind.Folder;
const { formatTypeForCompletion } = require("../utils/typeFormatter");

/** @type {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} */
let logger = console;

/**
 * Set the logger for completion provider
 * @param {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} l
 */
function setLogger(l) {
  logger = l || console;
}

/**
 * Get completions for the current position
 *
 * @param {TextDocument} document - The document
 * @param {Position} position - Cursor position
 * @param {object} schema - The api-ape schema
 * @returns {CompletionItem[]}
 */
function getCompletions(document, position, schema) {
  logger.log?.(`[COMP] getCompletions() at line ${position.line + 1}, col ${position.character}`);

  const text = document.getText();
  const offset = document.offsetAt(position);

  // Get the text before cursor on this line
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineText = text.slice(lineStart, offset);
  logger.log?.(`[COMP]   Line text before cursor: "${lineText}"`);

  // Check if we're in an api chain
  const apiChainMatch = lineText.match(/\bapi\.([\w.]*?)$/);
  if (!apiChainMatch) {
    // Not in an api chain - no completions
    logger.log?.(`[COMP]   No 'api.' chain detected, returning empty`);
    return [];
  }

  const currentChain = apiChainMatch[1] || "";
  const currentPath = currentChain.replace(/\./g, "/");
  logger.log?.(`[COMP]   API chain detected: "api.${currentChain}" → path: "${currentPath}"`);
  logger.log?.(`[COMP]   Schema has ${schema.endpoints?.length || 0} endpoint(s): [${schema.endpoints?.map(e => e.path).join(', ') || 'none'}]`);

  // Find matching endpoints
  const completions = [];
  const seenNamespaces = new Set();
  let matchedCount = 0;
  let skippedCount = 0;

  for (const endpoint of schema.endpoints) {
    // Check if endpoint matches current path prefix
    if (currentPath && !endpoint.path.startsWith(currentPath)) {
      skippedCount++;
      continue;
    }
    matchedCount++;

    // Get the remaining part after current path
    const remaining = currentPath
      ? endpoint.path.slice(currentPath.length).replace(/^\//, "")
      : endpoint.path;

    if (!remaining) {
      // Exact match - suggest calling the endpoint
      logger.log?.(`[COMP]   Exact match: "${endpoint.path}" → adding "()" completion`);
      completions.push({
        label: "()",
        kind: API_APE_ENDPOINT_KIND,
        sortText: "0_()",
        filterText: "()",
        detail: `Call /${endpoint.path}`,
        documentation: endpoint.description || `Endpoint: /${endpoint.path}`,
        textEdit: TextEdit.insert(position, "()"),
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

    logger.log?.(`[COMP]   Match: "${endpoint.path}" → adding "${nextSegment}" (${isEndpoint ? 'endpoint' : 'namespace'})`);

    completions.push({
      label: nextSegment,
      kind: isEndpoint ? API_APE_ENDPOINT_KIND : API_APE_NAMESPACE_KIND,
      sortText: `0_${nextSegment}`,
      filterText: nextSegment,
      detail: isEndpoint ? `Endpoint: /${fullPath}` : `Namespace: /${fullPath}/...`,
      documentation: isEndpoint
        ? endpoint.description || `Call /${fullPath}`
        : `Access endpoints under /${fullPath}`,
      textEdit: TextEdit.insert(position, nextSegment),
      insertTextFormat: InsertTextFormat.PlainText,
      data: { endpointPath: fullPath, isNamespace: !isEndpoint },
    });
  }

  logger.log?.(`[COMP]   Endpoints matched: ${matchedCount}, skipped: ${skippedCount}`);
  logger.log?.(`[COMP]   Returning ${completions.length} completion(s): [${completions.map(c => c.label).join(', ')}]`);

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
    docParts.push(formatTypeForCompletion(endpoint.input));
    docParts.push("```");
  }

  if (endpoint.output) {
    docParts.push("");
    docParts.push("**Returns:**");
    docParts.push("```typescript");
    docParts.push(formatTypeForCompletion(endpoint.output));
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

module.exports = {
  getCompletions,
  resolveCompletion,
  setLogger,
};
