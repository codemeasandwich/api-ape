/**
 * @fileoverview Status bar and health monitoring for api-ape extension
 *
 * Functions for managing the VS Code status bar and periodic health checks.
 */

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

/**
 * Create and configure the status bar item
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @returns {vscode.StatusBarItem} The status bar item
 */
function createStatusBar(context) {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "apiApe.showStatus";
  statusBarItem.text = "$(sync~spin) api-ape";
  statusBarItem.tooltip = "Connecting to api-ape server...";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

/**
 * Update status bar based on schema status result
 *
 * @param {object} result - Status result from LSP
 * @param {vscode.StatusBarItem} statusBarItem - Status bar item
 */
function updateStatusFromResult(result, statusBarItem) {
  if (result?.serverConnected) {
    statusBarItem.text = "$(debug-disconnect) api-ape";
    statusBarItem.tooltip = `Connected to ${result.serverUrl} - ${result.endpointCount} endpoints`;
  } else if (result?.schemaSource === "file") {
    statusBarItem.text = "$(file) api-ape";
    statusBarItem.tooltip = `Using local schema (${result.endpointCount} endpoints)\nServer: ${result.lastError || "Not connected"}`;
  } else if (result?.schemaSource === "generated") {
    statusBarItem.text = "$(tools) api-ape";
    statusBarItem.tooltip = `Generated from controllers (${result.endpointCount} endpoints)\nServer: ${result.lastError || "Not connected"}`;
  } else if (result?.consecutiveFailures > 0) {
    const retryInfo = result.consecutiveFailures > 3 ? " (retries paused)" : ` (retry ${result.consecutiveFailures})`;
    statusBarItem.text = "$(warning) api-ape";
    statusBarItem.tooltip = `Connection failed${retryInfo}: ${result.lastError}\nClick to configure server`;
  } else {
    statusBarItem.text = "$(error) api-ape";
    statusBarItem.tooltip = "No schema available - start server or generate types";
  }
}

/**
 * Start periodic health monitoring
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function} getClient - Function to get LSP client
 * @param {vscode.StatusBarItem} statusBarItem - Status bar item
 * @returns {NodeJS.Timeout} The interval handle
 */
function startHealthMonitoring(context, getClient, statusBarItem) {
  const healthCheckInterval = setInterval(async () => {
    const client = getClient();
    if (!client) return;

    try {
      const result = await client.sendRequest("workspace/executeCommand", {
        command: "apiApe.getStatus",
      });
      updateStatusFromResult(result, statusBarItem);
    } catch {
      // Silently fail - don't spam user
    }
  }, 30000);

  context.subscriptions.push({
    dispose: () => clearInterval(healthCheckInterval),
  });

  return healthCheckInterval;
}

/**
 * Check if schema needs regeneration by comparing file mtimes
 *
 * @param {import('vscode-languageclient/node').LanguageClient} client - LSP client
 * @param {vscode.StatusBarItem} statusBarItem - Status bar item
 * @param {function} log - Logging function
 * @returns {Promise<void>}
 */
async function checkSchemaFreshness(client, statusBarItem, log) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  const config = vscode.workspace.getConfiguration("apiApe");
  const controllersPath = config.get("controllersPath", "api");
  const outputPath = config.get("typesOutputPath", ".api-ape");

  const schemaPath = path.join(workspaceRoot, outputPath, "schema.json");
  const controllersDir = path.join(workspaceRoot, controllersPath);

  if (!fs.existsSync(controllersDir)) return;

  let needsRegeneration = false;

  try {
    const schemaStat = fs.statSync(schemaPath);
    const schemaTime = schemaStat.mtimeMs;

    /**
     * Check if any file in directory is newer than schema
     * @param {string} dir - Directory to check
     * @returns {boolean} True if any file is newer
     */
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (checkDir(fullPath)) return true;
        } else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
          if (!entry.name.endsWith(".d.ts")) {
            const fileStat = fs.statSync(fullPath);
            if (fileStat.mtimeMs > schemaTime) return true;
          }
        }
      }
      return false;
    };

    needsRegeneration = checkDir(controllersDir);
  } catch {
    needsRegeneration = true;
  }

  if (needsRegeneration) {
    log("Schema is stale, regenerating types...");
    statusBarItem.text = "$(sync~spin) api-ape";
    statusBarItem.tooltip = "Regenerating types...";
    try {
      await client.sendRequest("workspace/executeCommand", {
        command: "apiApe.generateTypes",
        arguments: [outputPath],
      });
      log("Types regenerated successfully");
      statusBarItem.text = "$(check) api-ape";
      statusBarItem.tooltip = "Types regenerated";
      setTimeout(() => {
        statusBarItem.text = "$(debug-disconnect) api-ape";
        statusBarItem.tooltip = "api-ape IntelliSense active";
      }, 3000);
    } catch (err) {
      log(`Failed to regenerate types: ${err.message || err}`);
    }
  }
}

module.exports = {
  createStatusBar,
  updateStatusFromResult,
  startHealthMonitoring,
  checkSchemaFreshness,
};
