/**
 * @fileoverview File Watcher for api-ape VS Code Extension
 *
 * Watches for controller file changes and notifies the LSP server.
 */

const vscode = require("vscode");

/**
 * Watch for controller file changes
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {import('vscode-languageclient/node').LanguageClient} client - LSP client
 * @param {Function} triggerAutoGenerate - Callback to trigger type generation
 * @param {Function} getExplorerProvider - Callback to get explorer provider for refresh
 */
function setupFileWatcher(context, client, triggerAutoGenerate, getExplorerProvider) {
  const config = vscode.workspace.getConfiguration("apiApe");
  const controllersPath = config.get("controllersPath", "api");

  // Watch both JS and TS controller files
  const watcher = vscode.workspace.createFileSystemWatcher(
    `**/${controllersPath}/**/*.{js,ts}`
  );

  watcher.onDidChange(async (uri) => {
    if (client) {
      try {
        await client.sendRequest("apiApe/controllerChanged", {
          file: uri.fsPath,
        });
        // Trigger auto-generation after schema refresh
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          explorerProvider.refresh();
        }
      } catch (err) {
        console.error("Failed to notify controller change:", err);
      }
    }
  });

  watcher.onDidCreate(async (uri) => {
    if (client) {
      try {
        await client.sendRequest("apiApe/controllerAdded", {
          file: uri.fsPath,
        });
        // Trigger auto-generation after schema refresh
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          explorerProvider.refresh();
        }
      } catch (err) {
        console.error("Failed to notify controller added:", err);
      }
    }
  });

  watcher.onDidDelete(async (uri) => {
    if (client) {
      try {
        await client.sendRequest("apiApe/controllerDeleted", {
          file: uri.fsPath,
        });
        // Trigger auto-generation after schema refresh
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          explorerProvider.refresh();
        }
      } catch (err) {
        console.error("Failed to notify controller deleted:", err);
      }
    }
  });

  context.subscriptions.push(watcher);
}

module.exports = { setupFileWatcher };
