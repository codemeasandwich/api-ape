/**
 * @fileoverview Code Actions Provider for api-ape LSP
 *
 * Provides quick fixes for api-ape related diagnostics,
 * such as fixing typos in endpoint names.
 */

const { CodeActionKind, TextEdit } = require("vscode-languageserver/node");

/**
 * Get code actions for the given range and diagnostics
 *
 * @param {TextDocument} document - The document
 * @param {Range} range - The range to get actions for
 * @param {CodeActionContext} context - Context with diagnostics
 * @param {object} schema - The api-ape schema
 * @returns {CodeAction[]}
 */
function getCodeActions(document, range, context, schema) {
  const actions = [];

  // Process diagnostics in the context
  for (const diagnostic of context.diagnostics) {
    // Only handle api-ape diagnostics
    if (diagnostic.source !== "api-ape") continue;

    // Handle unknown endpoint diagnostics
    if (diagnostic.data?.type === "unknownEndpoint") {
      const suggestions = diagnostic.data.suggestions || [];

      for (const suggestion of suggestions) {
        const newText = suggestion.replace(/\//g, ".");

        actions.push({
          title: `Change to 'api.${newText}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          isPreferred: suggestions.indexOf(suggestion) === 0,
          edit: {
            changes: {
              [document.uri]: [
                TextEdit.replace(diagnostic.range, newText),
              ],
            },
          },
        });
      }

      // Add action to create the endpoint if it doesn't exist
      if (diagnostic.data.invalidPath) {
        actions.push({
          title: `Create endpoint '/${diagnostic.data.invalidPath}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          command: {
            title: "Create Endpoint",
            command: "apiApe.createEndpoint",
            arguments: [diagnostic.data.invalidPath],
          },
        });
      }
    }

    // Handle deprecated endpoint diagnostics
    if (diagnostic.data?.type === "deprecatedEndpoint" && diagnostic.data.replacement) {
      const newText = diagnostic.data.replacement.replace(/\//g, ".");

      actions.push({
        title: `Replace with 'api.${newText}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [document.uri]: [
              TextEdit.replace(diagnostic.range, newText),
            ],
          },
        },
      });
    }

    // Handle missing required parameters
    if (diagnostic.data?.type === "missingParams") {
      const missingParams = diagnostic.data.missingParams || [];
      const endpoint = schema.endpoints.find((e) => e.path === diagnostic.data.path);

      if (endpoint && missingParams.length > 0) {
        // Generate snippet with missing params
        const text = document.getText();
        const startOffset = document.offsetAt(diagnostic.range.start);
        const existingArgs = text.slice(startOffset, document.offsetAt(diagnostic.range.end));

        // Build the new properties to add
        const newProps = missingParams.map((param) => {
          const propDef = endpoint.input?.properties?.[param];
          const defaultValue = getDefaultValue(propDef);
          return `${param}: ${defaultValue}`;
        });

        // Try to insert into existing object
        if (existingArgs.trim() === "{}") {
          // Empty object, replace with params
          actions.push({
            title: `Add missing parameter${missingParams.length > 1 ? "s" : ""}: ${missingParams.join(", ")}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
              changes: {
                [document.uri]: [
                  TextEdit.replace(diagnostic.range, `{ ${newProps.join(", ")} }`),
                ],
              },
            },
          });
        } else if (existingArgs.includes("{")) {
          // Non-empty object, append params before closing brace
          const insertPos = {
            line: diagnostic.range.end.line,
            character: diagnostic.range.end.character - 1,
          };
          const prefix = existingArgs.trim().endsWith("{") ? " " : ", ";

          actions.push({
            title: `Add missing parameter${missingParams.length > 1 ? "s" : ""}: ${missingParams.join(", ")}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
              changes: {
                [document.uri]: [
                  TextEdit.insert(insertPos, `${prefix}${newProps.join(", ")} `),
                ],
              },
            },
          });
        }
      }
    }
  }

  return actions;
}

/**
 * Get a default value placeholder for a type
 *
 * @param {object} typeDef - Type definition
 * @returns {string} Default value string
 */
function getDefaultValue(typeDef) {
  if (!typeDef) return "undefined";

  const kind = typeDef.kind || typeDef.type;
  const name = typeDef.name || typeDef.type;

  switch (kind) {
    case "primitive":
      switch (name) {
        case "string":
          return '""';
        case "number":
          return "0";
        case "boolean":
          return "false";
        default:
          return "undefined";
      }
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      if (name === "string") return '""';
      if (name === "number") return "0";
      if (name === "boolean") return "false";
      return "undefined";
  }
}

/**
 * Resolve additional details for a code action
 *
 * @param {CodeAction} codeAction - The code action to resolve
 * @returns {CodeAction}
 */
function resolveCodeAction(codeAction) {
  // Currently no additional resolution needed
  return codeAction;
}

module.exports = {
  getCodeActions,
  resolveCodeAction,
};
