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

  // Initialize schema manager
  schemaManager = new SchemaManager({
    workspaceRoot,
    serverUrl: settings.serverUrl,
    controllersPath: settings.controllersPath,
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

      executeCommandProvider: {
        commands: ["apiApe.refreshSchema", "apiApe.generateTypes"],
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
 * Execute commands
 */
connection.onExecuteCommand(async (params) => {
  switch (params.command) {
    case "apiApe.refreshSchema":
      await schemaManager.refresh();
      connection.console.log("Schema refreshed");
      break;

    case "apiApe.generateTypes":
      // TODO: Implement type generation command
      connection.console.log("Generate types command not yet implemented");
      break;
  }
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
