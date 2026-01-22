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
 * @param {Function} [log] - Optional logger function
 */
function setupFileWatcher(context, client, triggerAutoGenerate, getExplorerProvider, log = console.log) {
  const config = vscode.workspace.getConfiguration("apiApe");
  const controllersPath = config.get("controllersPath", "api");
  const watchPattern = `**/${controllersPath}/**/*.{js,ts}`;

  log(`[WATCH] Setting up file watcher`);
  log(`[WATCH]   Pattern: ${watchPattern}`);
  log(`[WATCH]   Controllers path: ${controllersPath}`);

  // Watch both JS and TS controller files
  const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);
  log(`[WATCH]   Watcher created successfully`);

  watcher.onDidChange(async (uri) => {
    log(`[WATCH] ========================================`);
    log(`[WATCH] File CHANGED: ${uri.fsPath}`);
    if (client) {
      try {
        log(`[WATCH]   Sending apiApe/controllerChanged to LSP...`);
        await client.sendRequest("apiApe/controllerChanged", {
          file: uri.fsPath,
        });
        log(`[WATCH]   LSP notified successfully`);
        // Trigger auto-generation after schema refresh
        log(`[WATCH]   Triggering auto-generate...`);
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          log(`[WATCH]   Refreshing explorer...`);
          explorerProvider.refresh();
        }
        log(`[WATCH]   Change handling complete`);
      } catch (err) {
        log(`[WATCH]   ERROR: Failed to notify controller change: ${err.message}`);
        console.error("Failed to notify controller change:", err);
      }
    } else {
      log(`[WATCH]   No LSP client available, skipping notification`);
    }
    log(`[WATCH] ========================================`);
  });

  watcher.onDidCreate(async (uri) => {
    log(`[WATCH] ========================================`);
    log(`[WATCH] File CREATED: ${uri.fsPath}`);
    if (client) {
      try {
        log(`[WATCH]   Sending apiApe/controllerAdded to LSP...`);
        await client.sendRequest("apiApe/controllerAdded", {
          file: uri.fsPath,
        });
        log(`[WATCH]   LSP notified successfully`);
        // Trigger auto-generation after schema refresh
        log(`[WATCH]   Triggering auto-generate...`);
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          log(`[WATCH]   Refreshing explorer...`);
          explorerProvider.refresh();
        }
        log(`[WATCH]   Create handling complete`);
      } catch (err) {
        log(`[WATCH]   ERROR: Failed to notify controller added: ${err.message}`);
        console.error("Failed to notify controller added:", err);
      }
    } else {
      log(`[WATCH]   No LSP client available, skipping notification`);
    }
    log(`[WATCH] ========================================`);
  });

  watcher.onDidDelete(async (uri) => {
    log(`[WATCH] ========================================`);
    log(`[WATCH] File DELETED: ${uri.fsPath}`);
    if (client) {
      try {
        log(`[WATCH]   Sending apiApe/controllerDeleted to LSP...`);
        await client.sendRequest("apiApe/controllerDeleted", {
          file: uri.fsPath,
        });
        log(`[WATCH]   LSP notified successfully`);
        // Trigger auto-generation after schema refresh
        log(`[WATCH]   Triggering auto-generate...`);
        await triggerAutoGenerate();
        // Refresh explorer
        const explorerProvider = getExplorerProvider();
        if (explorerProvider) {
          log(`[WATCH]   Refreshing explorer...`);
          explorerProvider.refresh();
        }
        log(`[WATCH]   Delete handling complete`);
      } catch (err) {
        log(`[WATCH]   ERROR: Failed to notify controller deleted: ${err.message}`);
        console.error("Failed to notify controller deleted:", err);
      }
    } else {
      log(`[WATCH]   No LSP client available, skipping notification`);
    }
    log(`[WATCH] ========================================`);
  });

  context.subscriptions.push(watcher);
  log(`[WATCH] File watcher setup complete`);
}

module.exports = { setupFileWatcher };
