/**
 * @fileoverview api-ape Language Server
 *
 * Provides IntelliSense features for api-ape:
 * - Completions for api.xxx.yyy paths
 * - Hover information showing endpoint documentation
 * - Go-to-definition jumping to controller files
 * - Diagnostics for invalid endpoints
 */

const {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  CompletionItemKind,
  DiagnosticSeverity,
  MarkupKind,
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { SchemaManager } = require("./schema/manager");
const { analyzeDocument } = require("./analysis/analyzer");
const {
  getCompletions,
  resolveCompletion,
} = require("./providers/completion");
const { getHover } = require("./providers/hover");
const { getDefinition } = require("./providers/definition");
const { getSignatureHelp } = require("./providers/signature");
const { getCodeActions, resolveCodeAction } = require("./providers/codeActions");

// Create a connection for the server using Node's IPC transport
const connection = createConnection(ProposedFeatures.all);

// Text document manager
const documents = new TextDocuments(TextDocument);

// Schema manager
let schemaManager = null;

// Settings
let settings = {
  serverUrl: "http://localhost:3000",
  controllersPath: "api",
  validateOnType: true,
};

/**
 * Initialize the server
 */
connection.onInitialize((params) => {
  const workspaceFolders = params.workspaceFolders || [];
  const workspaceRoot =
    workspaceFolders.length > 0 ? workspaceFolders[0].uri : null;

  // Initialize schema manager with logger
  schemaManager = new SchemaManager({
    workspaceRoot,
    serverUrl: settings.serverUrl,
    controllersPath: settings.controllersPath,
    logger: {
      log: (msg) => connection.console.log(msg),
      warn: (msg) => connection.console.warn(msg),
      error: (msg) => connection.console.error(msg),
    },
  });

  connection.console.log("api-ape LSP initialized");

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,

      completionProvider: {
        triggerCharacters: ["."],
        resolveProvider: true,
      },

      hoverProvider: true,

      definitionProvider: true,

      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
        retriggerCharacters: [","],
      },

      codeActionProvider: {
        codeActionKinds: ["quickfix"],
        resolveProvider: true,
      },

      executeCommandProvider: {
        commands: ["apiApe.refreshSchema", "apiApe.generateTypes", "apiApe.getStatus"],
      },
    },
  };
});

/**
 * Handle configuration changes
 */
connection.onDidChangeConfiguration((change) => {
  if (change.settings && change.settings.apiApe) {
    settings = { ...settings, ...change.settings.apiApe };

    if (schemaManager) {
      schemaManager.updateSettings({
        serverUrl: settings.serverUrl,
        controllersPath: settings.controllersPath,
      });
    }
  }
});

/**
 * Provide completions
 */
connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const schema = await schemaManager.getSchema();
  if (!schema) return [];

  return getCompletions(document, params.position, schema);
});

/**
 * Resolve completion item with additional details
 */
connection.onCompletionResolve(async (item) => {
  const schema = await schemaManager.getSchema();
  if (!schema) return item;

  return resolveCompletion(item, schema);
});

/**
 * Provide hover information
 */
connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const schema = await schemaManager.getSchema();
  if (!schema) return null;

  return getHover(document, params.position, schema);
});

/**
 * Provide go-to-definition
 */
connection.onDefinition(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const schema = await schemaManager.getSchema();
  if (!schema) return null;

  return getDefinition(document, params.position, schema);
});

/**
 * Provide signature help
 */
connection.onSignatureHelp(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const schema = await schemaManager.getSchema();
  if (!schema) return null;

  return getSignatureHelp(document, params.position, schema);
});

/**
 * Provide code actions (quick fixes)
 */
connection.onCodeAction(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const schema = await schemaManager.getSchema();
  if (!schema) return [];

  return getCodeActions(document, params.range, params.context, schema);
});

/**
 * Resolve code action details
 */
connection.onCodeActionResolve((codeAction) => {
  return resolveCodeAction(codeAction);
});

/**
 * Execute commands
 */
connection.onExecuteCommand(async (params) => {
  switch (params.command) {
    case "apiApe.refreshSchema":
      await schemaManager.refresh();
      connection.console.log("Schema refreshed");
      return { success: true };

    case "apiApe.generateTypes":
      try {
        const outputDir = params.arguments?.[0] || ".api-ape";
        const result = await schemaManager.generateTypes(outputDir);
        connection.console.log(`Types generated at ${result.typesPath}`);
        return {
          success: true,
          outputPath: result.outputPath,
          typesPath: result.typesPath,
          schemaPath: result.schemaPath,
        };
      } catch (err) {
        connection.console.error(`Failed to generate types: ${err.message}`);
        return {
          success: false,
          error: err.message,
        };
      }

    case "apiApe.getStatus":
      try {
        const status = await schemaManager.getStatus();
        return status;
      } catch (err) {
        connection.console.error(`Failed to get status: ${err.message}`);
        return {
          serverConnected: false,
          schemaSource: "none",
          endpointCount: 0,
          error: err.message,
        };
      }
  }
});

/**
 * Handle controller file change notifications
 */
connection.onRequest("apiApe/controllerChanged", async (params) => {
  connection.console.log(`Controller changed: ${params.file}`);
  await schemaManager.refresh();
  return { success: true };
});

connection.onRequest("apiApe/controllerAdded", async (params) => {
  connection.console.log(`Controller added: ${params.file}`);
  await schemaManager.refresh();
  return { success: true };
});

connection.onRequest("apiApe/controllerDeleted", async (params) => {
  connection.console.log(`Controller deleted: ${params.file}`);
  await schemaManager.refresh();
  return { success: true };
});

/**
 * Return current schema for tree view
 */
connection.onRequest("apiApe/getSchema", async () => {
  const schema = await schemaManager.getSchema();
  return schema;
});

/**
 * Validate document on change
 */
documents.onDidChangeContent(async (change) => {
  if (!settings.validateOnType) return;

  const document = change.document;
  const schema = await schemaManager.getSchema();
  if (!schema) return;

  const diagnostics = analyzeDocument(document, schema);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
});

/**
 * Clear diagnostics when document is closed
 */
documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// Start listening
documents.listen(connection);
connection.listen();
