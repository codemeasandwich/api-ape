/**
 * @fileoverview VS Code Extension for api-ape
 *
 * Provides IntelliSense and type checking for api-ape WebSocket APIs.
 */

const path = require("path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");
const { registerExplorer } = require("./explorer");
const { setupFileWatcher } = require("./fileWatcher");
const { registerPlaceholderExplorer, registerFallbackExplorer, registerFallbackCommands } = require("./placeholders");
const { registerCommands, triggerAutoGenerate } = require("./commands");
const { createStatusBar, updateStatusFromResult, startHealthMonitoring, checkSchemaFreshness } = require("./extension-status");

/** @type {import('vscode-languageclient/node').LanguageClient | undefined} */
let client;

/** @type {vscode.StatusBarItem | undefined} */
let statusBarItem;

/** @type {import('./explorer').EndpointTreeProvider | undefined} */
let explorerProvider;

/** @type {{timeout: NodeJS.Timeout | undefined}} */
const autoGenerateState = { timeout: undefined };

/** @type {vscode.OutputChannel | undefined} */
let outputChannel;

/**
 * Log to output channel
 * @param {string} message
 */
function log(message) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("api-ape");
  }
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Check if the workspace is an api-ape project
 * @returns {Promise<boolean>}
 */
async function isApiApeWorkspace() {
  log("[EXT] isApiApeWorkspace() checking...");

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log("[EXT]   No workspace folders found");
    return false;
  }

  const packageJsonFiles = await vscode.workspace.findFiles("**/package.json", "**/node_modules/**", 5);

  for (const file of packageJsonFiles) {
    try {
      const content = await vscode.workspace.fs.readFile(file);
      const json = JSON.parse(content.toString());
      const deps = { ...json.dependencies, ...json.devDependencies };
      if (deps["api-ape"]) {
        log(`[EXT]   Found 'api-ape' dependency in ${file.fsPath}`);
        return true;
      }
    } catch {
      // Continue checking other files
    }
  }

  const configFiles = await vscode.workspace.findFiles("**/.api-ape{,.json,/schema.json}", "**/node_modules/**", 1);
  return configFiles.length > 0;
}

/**
 * Start the Language Server
 * @param {vscode.ExtensionContext} context - Extension context
 * @returns {Promise<void>}
 */
function startLanguageClient(context) {
  const serverModule = context.asAbsolutePath(path.join("api-ape-lsp", "src", "server.js"));

  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } },
  };

  const clientOptions = {
    documentSelector: [
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "typescriptreact" },
      { scheme: "file", language: "html" },
    ],
    synchronize: {
      configurationSection: "apiApe",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/api/**/*.{js,ts}"),
    },
  };

  client = new LanguageClient("apiApeLsp", "api-ape Language Server", serverOptions, clientOptions);
  return client.start();
}

/**
 * Update status bar text and tooltip
 * @param {string} text - Status bar text
 * @param {string} [tooltip] - Tooltip text
 */
function updateStatusBar(text, tooltip) {
  if (statusBarItem) {
    statusBarItem.text = text;
    if (tooltip) statusBarItem.tooltip = tooltip;
  }
}

/**
 * Extension activation
 * @param {vscode.ExtensionContext} context - Extension context
 */
async function activate(context) {
  log("[EXT] api-ape extension activating...");

  const isApiApe = await isApiApeWorkspace();
  if (!isApiApe) {
    log("[EXT] Not an api-ape workspace, registering placeholder explorer");
    registerPlaceholderExplorer(context, log);
    return;
  }

  log("[EXT] api-ape workspace detected, starting LSP...");
  statusBarItem = createStatusBar(context);

  /** @returns {import('vscode-languageclient/node').LanguageClient | undefined} */
  const getClient = () => client;
  registerCommands(context, getClient, updateStatusBar);

  try {
    await startLanguageClient(context);
    log("[EXT] LSP client ready, registering explorer");

    /** @returns {Promise<void>} */
    const doAutoGenerate = () => triggerAutoGenerate(getClient, updateStatusBar, autoGenerateState);
    const config = vscode.workspace.getConfiguration("apiApe");
    const controllersPath = config.get("controllersPath", "api");
    setupFileWatcher(context, client, doAutoGenerate, () => explorerProvider, log);

    explorerProvider = registerExplorer(context, client);

    await checkSchemaFreshness(client, statusBarItem, log);

    try {
      const result = await client.sendRequest("workspace/executeCommand", { command: "apiApe.getStatus" });
      updateStatusFromResult(result, statusBarItem);
    } catch {
      updateStatusBar("$(debug-disconnect) api-ape", "api-ape IntelliSense active");
    }

    startHealthMonitoring(context, getClient, statusBarItem);
    log("[EXT] Extension activation complete");
  } catch (err) {
    log(`[EXT] LSP client failed to start: ${err.message || err}`);
    updateStatusBar("$(error) api-ape", "Failed to start language server");
    registerFallbackCommands(context, log);
    registerFallbackExplorer(context, log);
  }
}

/**
 * Extension deactivation
 * @returns {Promise<void>|undefined}
 */
function deactivate() {
  if (autoGenerateState.timeout) {
    clearTimeout(autoGenerateState.timeout);
    autoGenerateState.timeout = undefined;
  }

  if (client) {
    return client.stop();
  }
}

module.exports = { activate, deactivate };
