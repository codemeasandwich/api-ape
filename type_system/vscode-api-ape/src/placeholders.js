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

  // Event emitter for tree refresh
  const treeDataChanged = new vscode.EventEmitter();

  const placeholderProvider = {
    onDidChangeTreeData: treeDataChanged.event,
    getTreeItem: (element) => element,
    getChildren: () => {
      const config = vscode.workspace.getConfiguration("apiApe");

      // Info item
      const infoItem = new vscode.TreeItem(
        "No api-ape project detected",
        vscode.TreeItemCollapsibleState.None
      );
      infoItem.description = "Configure manually below";
      infoItem.iconPath = new vscode.ThemeIcon("info");

      // Configure Server URL item
      const serverItem = new vscode.TreeItem(
        "Configure Server URL",
        vscode.TreeItemCollapsibleState.None
      );
      serverItem.description = config.get("serverUrl", "http://localhost:3000");
      serverItem.iconPath = new vscode.ThemeIcon("globe");
      serverItem.command = {
        command: "apiApe.configureServer",
        title: "Configure Server URL",
      };

      // Configure Controllers Path item
      const pathItem = new vscode.TreeItem(
        "Set Controllers Path",
        vscode.TreeItemCollapsibleState.None
      );
      pathItem.description = config.get("controllersPath", "api");
      pathItem.iconPath = new vscode.ThemeIcon("folder");
      pathItem.command = {
        command: "apiApe.configureControllersPath",
        title: "Set Controllers Path",
      };

      return [infoItem, serverItem, pathItem];
    },
  };

  const treeView = vscode.window.createTreeView("apiApeEndpoints", {
    treeDataProvider: placeholderProvider,
  });
  context.subscriptions.push(treeView);

  // Register configure server command (functional even without project)
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.configureServer", async () => {
      const config = vscode.workspace.getConfiguration("apiApe");
      const currentUrl = config.get("serverUrl", "http://localhost:3000");

      const newUrl = await vscode.window.showInputBox({
        prompt: "Enter api-ape server URL",
        value: currentUrl,
        placeHolder: "http://localhost:3000",
        validateInput: (value) => {
          try {
            new URL(value);
            return null;
          } catch {
            return "Please enter a valid URL";
          }
        },
      });

      if (newUrl) {
        await config.update("serverUrl", newUrl, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`api-ape server URL updated to ${newUrl}`);
        treeDataChanged.fire();
      }
    })
  );

  // Register configure controllers path command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.configureControllersPath", async () => {
      const config = vscode.workspace.getConfiguration("apiApe");
      const currentPath = config.get("controllersPath", "api");

      const options = [
        { label: "$(folder) Browse for folder...", action: "browse" },
        { label: "$(edit) Enter path manually...", action: "manual" },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `Current path: ${currentPath}`,
      });

      if (!selected) return;

      let newPath;

      if (selected.action === "browse") {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, currentPath)
          : undefined;

        const folders = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri,
          openLabel: "Select Controllers Folder",
        });

        if (folders && folders[0]) {
          // Make path relative to workspace if possible
          if (workspaceFolder) {
            newPath = vscode.workspace.asRelativePath(folders[0], false);
          } else {
            newPath = folders[0].fsPath;
          }
        }
      } else {
        newPath = await vscode.window.showInputBox({
          prompt: "Enter path to controllers directory (relative to workspace)",
          value: currentPath,
          placeHolder: "api",
        });
      }

      if (newPath) {
        await config.update("controllersPath", newPath, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`api-ape controllers path updated to ${newPath}`);
        treeDataChanged.fire();
      }
    })
  );

  // Register other placeholder commands
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.explorer.refresh", () => {
      treeDataChanged.fire();
      vscode.window.showInformationMessage("api-ape: Configure server URL and controllers path to connect.");
    }),
    vscode.commands.registerCommand("apiApe.explorer.insertCall", () => {
      vscode.window.showInformationMessage("api-ape: Configure server URL and controllers path to enable this feature.");
    }),
    vscode.commands.registerCommand("apiApe.refreshSchema", () => {
      vscode.window.showInformationMessage("api-ape: Configure settings, then reload window to connect to server.");
    }),
    vscode.commands.registerCommand("apiApe.generateTypes", () => {
      vscode.window.showInformationMessage("api-ape: Configure settings, then reload window to generate types.");
    }),
    vscode.commands.registerCommand("apiApe.showStatus", () => {
      const config = vscode.workspace.getConfiguration("apiApe");
      vscode.window.showInformationMessage(
        `api-ape Status: Server: ${config.get("serverUrl")} | Controllers: ${config.get("controllersPath")} | Not connected`
      );
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
