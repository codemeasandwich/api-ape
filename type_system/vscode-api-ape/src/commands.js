/**
 * @fileoverview Command Registration for api-ape VS Code Extension
 *
 * Registers all extension commands with VS Code.
 */

const vscode = require("vscode");

/**
 * Register extension commands
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(): import('vscode-languageclient/node').LanguageClient | undefined} getClient - Function to get LSP client
 * @param {function(string, string=): void} updateStatusBar - Function to update status bar
 * @returns {void}
 */
function registerCommands(context, getClient, updateStatusBar) {
  // Refresh schema command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.refreshSchema", async () => {
      const client = getClient();
      if (client) {
        await client.sendRequest("workspace/executeCommand", {
          command: "apiApe.refreshSchema",
        });
        vscode.window.showInformationMessage("api-ape schema refreshed");
      }
    })
  );

  // Generate types command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.generateTypes", async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showErrorMessage("api-ape LSP not running");
        return;
      }

      const config = vscode.workspace.getConfiguration("apiApe");
      const outputPath = config.get("typesOutputPath", ".api-ape");

      try {
        const result = await client.sendRequest("workspace/executeCommand", {
          command: "apiApe.generateTypes",
          arguments: [outputPath],
        });

        if (result && result.success) {
          vscode.window.showInformationMessage(
            `api-ape types generated at ${result.typesPath}`
          );
        } else {
          vscode.window.showErrorMessage(
            `Failed to generate types: ${result?.error || "Unknown error"}`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to generate types: ${err.message}`);
      }
    })
  );

  // Configure server command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.configureServer", async () => {
      const config = vscode.workspace.getConfiguration("apiApe");
      const currentUrl = config.get("serverUrl", "http://localhost:3000");

      const newUrl = await vscode.window.showInputBox({
        prompt: "Enter api-ape server URL",
        value: currentUrl,
        placeHolder: "http://localhost:3000",
      });

      if (newUrl) {
        await config.update(
          "serverUrl",
          newUrl,
          vscode.ConfigurationTarget.Workspace
        );
        vscode.window.showInformationMessage(
          `api-ape server URL updated to ${newUrl}`
        );
      }
    })
  );

  // Show status command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.showStatus", async () => {
      const client = getClient();
      if (client) {
        try {
          const result = await client.sendRequest("workspace/executeCommand", {
            command: "apiApe.getStatus",
          });
          const items = [
            `Server: ${result?.serverConnected ? "Connected" : "Disconnected"}`,
            `Endpoints: ${result?.endpointCount || 0}`,
            `Schema Source: ${result?.schemaSource || "Unknown"}`,
          ];
          vscode.window.showInformationMessage(
            `api-ape Status: ${items.join(" | ")}`
          );
        } catch {
          vscode.window.showInformationMessage(
            "api-ape: Unable to get status"
          );
        }
      }
    })
  );
}

/**
 * Trigger auto-generation of types (debounced)
 *
 * @param {function(): import('vscode-languageclient/node').LanguageClient | undefined} getClient - Function to get LSP client
 * @param {function(string, string=): void} updateStatusBar - Function to update status bar
 * @param {{timeout: NodeJS.Timeout | undefined}} state - Shared state for debounce timer
 * @returns {Promise<void>}
 */
async function triggerAutoGenerate(getClient, updateStatusBar, state) {
  const config = vscode.workspace.getConfiguration("apiApe");
  const autoGenerate = config.get("autoGenerateTypes", true);
  const client = getClient();

  if (!autoGenerate || !client) {
    return;
  }

  // Debounce to avoid generating on every keystroke
  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  state.timeout = setTimeout(async () => {
    try {
      const outputPath = config.get("typesOutputPath", ".api-ape");
      updateStatusBar("$(sync~spin) api-ape: generating types...", "Generating type definitions");

      const result = await client.sendRequest("workspace/executeCommand", {
        command: "apiApe.generateTypes",
        arguments: [outputPath],
      });

      if (result && result.success) {
        updateStatusBar("$(check) api-ape", "Types generated successfully");
        // Reset to normal status after 3 seconds
        setTimeout(() => updateStatusBar("$(zap) api-ape", "api-ape IntelliSense active"), 3000);
      }
    } catch (err) {
      console.error("Auto-generate types failed:", err);
      updateStatusBar("$(warning) api-ape", `Auto-generate failed: ${err.message}`);
    }
  }, 1000); // 1 second debounce
}

module.exports = { registerCommands, triggerAutoGenerate };
