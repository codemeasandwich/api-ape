/**
 * @fileoverview VS Code Extension for api-ape
 *
 * Provides IntelliSense and type checking for api-ape WebSocket APIs.
 */

const path = require("path");
const vscode = require("vscode");
const {
  LanguageClient,
  TransportKind,
} = require("vscode-languageclient/node");

/** @type {LanguageClient | undefined} */
let client;

/**
 * Check if the workspace is an api-ape project
 *
 * @returns {Promise<boolean>}
 */
async function isApiApeWorkspace() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false;
  }

  // Check for api-ape in package.json
  const packageJsonFiles = await vscode.workspace.findFiles(
    "**/package.json",
    "**/node_modules/**",
    5
  );

  for (const file of packageJsonFiles) {
    try {
      const content = await vscode.workspace.fs.readFile(file);
      const json = JSON.parse(content.toString());
      const deps = { ...json.dependencies, ...json.devDependencies };

      if (deps["api-ape"]) {
        return true;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check for .api-ape directory or config file
  const configFiles = await vscode.workspace.findFiles(
    "**/.api-ape{,.json,/schema.json}",
    "**/node_modules/**",
    1
  );

  return configFiles.length > 0;
}

/**
 * Start the Language Server
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
function startLanguageClient(context) {
  // Path to the LSP server module
  const serverModule = context.asAbsolutePath(
    path.join("..", "api-ape-lsp", "src", "server.js")
  );

  // Server options
  const serverOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  // Client options
  const clientOptions = {
    documentSelector: [
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "typescriptreact" },
    ],
    synchronize: {
      configurationSection: "apiApe",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/api/**/*.js"),
    },
  };

  // Create and start the client
  client = new LanguageClient(
    "apiApeLsp",
    "api-ape Language Server",
    serverOptions,
    clientOptions
  );

  client.start();
}

/**
 * Watch for controller file changes
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
function setupFileWatcher(context) {
  const config = vscode.workspace.getConfiguration("apiApe");
  const controllersPath = config.get("controllersPath", "api");

  const watcher = vscode.workspace.createFileSystemWatcher(
    `**/${controllersPath}/**/*.js`
  );

  watcher.onDidChange(async (uri) => {
    if (client) {
      await client.sendRequest("apiApe/controllerChanged", {
        file: uri.fsPath,
      });
    }
  });

  watcher.onDidCreate(async (uri) => {
    if (client) {
      await client.sendRequest("apiApe/controllerAdded", {
        file: uri.fsPath,
      });
    }
  });

  watcher.onDidDelete(async (uri) => {
    if (client) {
      await client.sendRequest("apiApe/controllerDeleted", {
        file: uri.fsPath,
      });
    }
  });

  context.subscriptions.push(watcher);
}

/**
 * Register commands
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
function registerCommands(context) {
  // Refresh schema command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.refreshSchema", async () => {
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
      const config = vscode.workspace.getConfiguration("apiApe");
      const controllersPath = config.get("controllersPath", "api");
      const outputPath = config.get("typesOutputPath", ".api-ape");

      // Find workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Run the CLI tool
      const terminal = vscode.window.createTerminal("api-ape types");
      terminal.sendText(
        `npx api-ape-types --controllers ${controllersPath} --output ${outputPath}`
      );
      terminal.show();
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
}

/**
 * Extension activation
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
async function activate(context) {
  console.log("api-ape extension activating...");

  // Check if this is an api-ape workspace
  const isApiApe = await isApiApeWorkspace();
  if (!isApiApe) {
    console.log("Not an api-ape workspace, skipping activation");
    return;
  }

  console.log("api-ape workspace detected, starting LSP...");

  // Start the language client
  startLanguageClient(context);

  // Set up file watcher
  setupFileWatcher(context);

  // Register commands
  registerCommands(context);

  // Show activation message
  vscode.window.setStatusBarMessage("api-ape IntelliSense active", 3000);
}

/**
 * Extension deactivation
 *
 * @returns {Promise<void>|undefined} Promise that resolves when client stops
 */
function deactivate() {
  if (client) {
    return client.stop();
  }
}

module.exports = { activate, deactivate };
