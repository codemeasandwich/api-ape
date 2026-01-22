/**
 * @fileoverview Command Registration for api-ape VS Code Extension
 *
 * Registers all extension commands with VS Code.
 */

const vscode = require("vscode");

/**
 * Register client-side extension commands
 *
 * Note: Commands handled by the LSP server (refreshSchema, generateTypes, getStatus)
 * are NOT registered here. The vscode-languageclient automatically registers them
 * based on the server's executeCommandProvider capabilities.
 *
 * @param {vscode.ExtensionContext} context - Extension context
 * @param {function(): import('vscode-languageclient/node').LanguageClient | undefined} getClient - Function to get LSP client
 * @param {function(string, string=): void} updateStatusBar - Function to update status bar
 * @returns {void}
 */
function registerCommands(context, getClient, updateStatusBar) {
  // Configure server command (client-side only - not handled by LSP)
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

  // Show status command (client-side - calls LSP's getStatus internally)
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
      } else {
        vscode.window.showWarningMessage("api-ape: LSP not running");
      }
    })
  );

  // Check connection command - manual connection test with progress indicator
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.checkConnection", async () => {
      const client = getClient();
      if (!client) {
        vscode.window.showWarningMessage("api-ape: LSP not running");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "api-ape: Checking server connection...",
          cancellable: false,
        },
        async () => {
          try {
            // Force a fresh fetch by refreshing schema first
            await client.sendRequest("workspace/executeCommand", {
              command: "apiApe.refreshSchema",
            });

            const result = await client.sendRequest("workspace/executeCommand", {
              command: "apiApe.getStatus",
            });

            if (result?.serverConnected) {
              vscode.window.showInformationMessage(
                `api-ape: Connected! Found ${result.endpointCount} endpoints.`
              );
              updateStatusBar("$(zap) api-ape", `Connected - ${result.endpointCount} endpoints`);
            } else {
              const items = ["Configure Server URL", "Generate Types Offline"];
              const selected = await vscode.window.showWarningMessage(
                `api-ape: Server not reachable (${result?.lastError || "unknown error"})`,
                ...items
              );

              if (selected === items[0]) {
                vscode.commands.executeCommand("apiApe.configureServer");
              } else if (selected === items[1]) {
                vscode.commands.executeCommand("apiApe.generateTypes");
              }
            }
          } catch (err) {
            vscode.window.showErrorMessage(
              `api-ape: Health check failed - ${err.message}`
            );
          }
        }
      );
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
