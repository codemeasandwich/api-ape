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
} = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { SchemaManager } = require("./schema/manager");
const { analyzeDocument } = require("./analysis/analyzer");
const { getCompletions, resolveCompletion, setLogger: setCompletionLogger } = require("./providers/completion");
const { getHover } = require("./providers/hover");
const { getDefinition } = require("./providers/definition");
const { getSignatureHelp } = require("./providers/signature");
const { getCodeActions, resolveCodeAction } = require("./providers/codeActions");
const { registerControllerHandlers, registerCommandHandler } = require("./server-handlers");

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let schemaManager = null;
let settings = {
  serverUrl: "http://localhost:3000",
  controllersPath: "api",
  validateOnType: true,
  fetchTimeout: 5000,
  maxRetries: 2,
  logLevel: "info",
};

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Check if a message at the given level should be logged
 * @param {string} level - Log level to check
 * @returns {boolean} True if the message should be logged
 */
function shouldLog(level) {
  const currentLevel = LOG_LEVELS[settings.logLevel] ?? LOG_LEVELS.warn;
  const messageLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  return messageLevel >= currentLevel;
}

connection.onInitialize((params) => {
  const workspaceFolders = params.workspaceFolders || [];
  const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0].uri : null;

  connection.console.log(`[LSP] api-ape LSP initializing...`);
  connection.console.log(`[LSP]   Workspace root: ${workspaceRoot}`);

  const lspLogger = {
    log: (msg) => shouldLog("info") && connection.console.log(msg),
    debug: (msg) => shouldLog("debug") && connection.console.log(`[DEBUG] ${msg}`),
    warn: (msg) => shouldLog("warn") && connection.console.warn(msg),
    error: (msg) => shouldLog("error") && connection.console.error(msg),
  };

  schemaManager = new SchemaManager({
    workspaceRoot,
    serverUrl: settings.serverUrl,
    controllersPath: settings.controllersPath,
    fetchTimeout: settings.fetchTimeout,
    maxRetries: settings.maxRetries,
    logger: lspLogger,
  });

  setCompletionLogger(lspLogger);
  registerControllerHandlers(connection, schemaManager);
  registerCommandHandler(connection, schemaManager);

  connection.console.log(`[LSP] api-ape LSP initialized`);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ["."], resolveProvider: true },
      hoverProvider: true,
      definitionProvider: true,
      signatureHelpProvider: { triggerCharacters: ["(", ","], retriggerCharacters: [","] },
      codeActionProvider: { codeActionKinds: ["quickfix"], resolveProvider: true },
      executeCommandProvider: {
        commands: ["apiApe.refreshSchema", "apiApe.generateTypes", "apiApe.getStatus"],
      },
    },
  };
});

connection.onDidChangeConfiguration((change) => {
  if (change.settings && change.settings.apiApe) {
    settings = { ...settings, ...change.settings.apiApe };
    if (schemaManager) {
      schemaManager.updateSettings({
        serverUrl: settings.serverUrl,
        controllersPath: settings.controllersPath,
        fetchTimeout: settings.fetchTimeout,
        maxRetries: settings.maxRetries,
      });
    }
  }
});

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const schema = await schemaManager.getSchema();
  if (!schema) return [];

  return getCompletions(document, params.position, schema);
});

connection.onCompletionResolve(async (item) => {
  const schema = await schemaManager.getSchema();
  if (!schema) return item;
  return resolveCompletion(item, schema);
});

connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const schema = await schemaManager.getSchema();
  if (!schema) return null;
  return getHover(document, params.position, schema);
});

connection.onDefinition(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const schema = await schemaManager.getSchema();
  if (!schema) return null;
  return getDefinition(document, params.position, schema);
});

connection.onSignatureHelp(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const schema = await schemaManager.getSchema();
  if (!schema) return null;
  return getSignatureHelp(document, params.position, schema);
});

connection.onCodeAction(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const schema = await schemaManager.getSchema();
  if (!schema) return [];
  return getCodeActions(document, params.range, params.context, schema);
});

connection.onCodeActionResolve((codeAction) => resolveCodeAction(codeAction));

documents.onDidChangeContent(async (change) => {
  if (!settings.validateOnType) return;
  const document = change.document;
  const schema = await schemaManager.getSchema();
  if (!schema) return;
  const diagnostics = analyzeDocument(document, schema);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
});

documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
