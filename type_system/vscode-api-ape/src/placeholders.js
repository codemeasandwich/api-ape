/**
 * @fileoverview Placeholder and Fallback Explorers for api-ape VS Code Extension
 *
 * Provides UI elements when the extension is not in an api-ape workspace
 * or when the LSP server fails to start.
 */

const vscode = require("vscode");

/** @type {boolean} */
let commandsRegistered = false;

/** @type {boolean} */
let fallbackExplorerRegistered = false;

/** @type {boolean} */
let fallbackCommandsRegistered = false;

/**
 * Register a placeholder explorer when not in an api-ape workspace
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(string): void} log - Logging function
 * @returns {void}
 */
function registerPlaceholderExplorer(context, log) {
  if (commandsRegistered) {
    log("Commands already registered, skipping placeholder registration");
    return;
  }
  commandsRegistered = true;

  const placeholderProvider = {
    getTreeItem: (element) => element,
    getChildren: () => {
      const item = new vscode.TreeItem(
        "No api-ape project detected",
        vscode.TreeItemCollapsibleState.None
      );
      item.description = "Add api-ape to package.json";
      item.iconPath = new vscode.ThemeIcon("info");
      return [item];
    },
  };

  const treeView = vscode.window.createTreeView("apiApeEndpoints", {
    treeDataProvider: placeholderProvider,
  });
  context.subscriptions.push(treeView);

  // Register placeholder commands that show helpful messages
  const noProjectMsg = "No api-ape project detected. Add 'api-ape' to your package.json dependencies.";
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.explorer.refresh", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Refreshing... " + noProjectMsg);
    }),
    vscode.commands.registerCommand("apiApe.explorer.insertCall", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Insert API Call: " + noProjectMsg);
    }),
    vscode.commands.registerCommand("apiApe.refreshSchema", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Refresh Schema: " + noProjectMsg);
    }),
    vscode.commands.registerCommand("apiApe.generateTypes", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Generate Types: " + noProjectMsg);
    }),
    vscode.commands.registerCommand("apiApe.configureServer", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Configure Server: " + noProjectMsg);
    }),
    vscode.commands.registerCommand("apiApe.showStatus", () => {
      vscode.window.showInformationMessage("PLACEHOLDER | Status: " + noProjectMsg);
    })
  );
}

/**
 * Register a fallback explorer when LSP fails to start
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(string): void} log - Logging function
 * @returns {void}
 */
function registerFallbackExplorer(context, log) {
  if (fallbackExplorerRegistered) {
    return;
  }
  fallbackExplorerRegistered = true;

  log("Registering fallback explorer (LSP unavailable)");

  const fallbackProvider = {
    getTreeItem: (element) => element,
    getChildren: () => {
      const item = new vscode.TreeItem(
        "LSP server failed to start",
        vscode.TreeItemCollapsibleState.None
      );
      item.description = "Check Output panel for details";
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    },
  };

  const treeView = vscode.window.createTreeView("apiApeEndpoints", {
    treeDataProvider: fallbackProvider,
  });
  context.subscriptions.push(treeView);

  // Register explorer commands as no-ops
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand("apiApe.explorer.refresh", () => {
        vscode.window.showWarningMessage("api-ape: LSP server not running. Check Output panel.");
      }),
      vscode.commands.registerCommand("apiApe.explorer.insertCall", () => {
        vscode.window.showWarningMessage("api-ape: LSP server not running. Check Output panel.");
      })
    );
  } catch (err) {
    log(`Explorer commands already registered: ${err.message}`);
  }
}

/**
 * Register fallback commands when LSP fails to start
 *
 * These commands are normally handled by the LSP server via executeCommandProvider.
 * When LSP is unavailable, we register no-op versions to prevent "command not found" errors.
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(string): void} log - Logging function
 * @returns {void}
 */
function registerFallbackCommands(context, log) {
  if (fallbackCommandsRegistered) {
    log("Fallback commands already registered, skipping");
    return;
  }
  fallbackCommandsRegistered = true;

  log("Registering fallback commands (LSP unavailable)");

  const lspUnavailableMsg = "api-ape: LSP server not running. Check Output panel for details.";

  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.refreshSchema", () => {
      vscode.window.showWarningMessage(lspUnavailableMsg);
    }),
    vscode.commands.registerCommand("apiApe.generateTypes", () => {
      vscode.window.showWarningMessage(lspUnavailableMsg);
    })
  );
}

module.exports = { registerPlaceholderExplorer, registerFallbackExplorer, registerFallbackCommands };
