/**
 * @fileoverview Tools webview provider
 */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { getToolsTemplate } = require("./tools.template");

class ToolsProvider {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('../services/ProgressService').ProgressService} progressService
   * @param {import('vscode-languageclient/node').LanguageClient | undefined} client
   */
  constructor(context, progressService, client) {
    this.context = context;
    this.progressService = progressService;
    this.client = client;
    this._view = undefined;
    this.recaps = this._loadJson("recaps.json");
    this.progressService.onProgressChanged(() => this._updateWebview());
  }

  /**
   * Load a JSON data file
   * @param {string} filename
   * @returns {Object}
   */
  _loadJson(filename) {
    const filePath = path.join(this.context.extensionPath, "src", "data", filename);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      console.error(`Failed to load ${filename}:`, err);
      return {};
    }
  }

  /**
   * Resolve the webview view
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (msg) => this._handleMessage(msg));
    webviewView.onDidChangeVisibility(() => { if (webviewView.visible) this._updateWebview(); });
  }

  /**
   * Handle messages from the webview
   * @param {Object} message
   */
  async _handleMessage(message) {
    switch (message.command) {
      case "ready": this._updateWebview(); break;
      case "refreshEndpoints": await this._refreshEndpoints(); break;
      case "generateTypes": await vscode.commands.executeCommand("apiApe.generateTypes"); break;
      case "configureServer": await vscode.commands.executeCommand("apiApe.configureServer"); break;
      case "openDocs": this._postMessage({ command: "showDocsPanel", recaps: this.recaps }); break;
      case "viewRecap":
        this.progressService.addRecentRecap(message.recapId);
        this._postMessage({ command: "showRecap", recap: this.recaps[message.recapId] });
        break;
      case "bookmarkRecap":
        const isBookmarked = this.progressService.toggleRecapBookmark(message.recapId);
        this._postMessage({ command: "updateBookmark", recapId: message.recapId, isBookmarked });
        break;
      case "copyCode":
        await vscode.env.clipboard.writeText(message.code);
        vscode.window.showInformationMessage("Code copied to clipboard!");
        break;
      case "goToEndpoint": await this._goToEndpoint(message.path); break;
      case "insertApiCall": await this._insertApiCall(message.path); break;
    }
  }

  /** Update the webview with current state */
  _updateWebview() {
    if (!this._view) return;
    this._postMessage({
      command: "updateState",
      state: {
        recentRecaps: this.progressService.getRecentRecaps().map((id) => this.recaps[id]).filter(Boolean),
        bookmarkedRecaps: this.progressService.getBookmarkedRecaps(),
      },
    });
  }

  /** Refresh endpoints from LSP */
  async _refreshEndpoints() {
    if (!this.client) { this._postMessage({ command: "endpointsError", error: "Language server not connected" }); return; }
    try {
      const result = await this.client.sendRequest("apiApe/getSchema");
      this._postMessage({ command: "updateEndpoints", endpoints: result.endpoints || [] });
    } catch (err) { this._postMessage({ command: "endpointsError", error: err.message }); }
  }

  /**
   * Go to endpoint definition
   * @param {string} endpointPath
   */
  async _goToEndpoint(endpointPath) {
    if (!this.client) return;
    try {
      const result = await this.client.sendRequest("apiApe/getEndpointLocation", { path: endpointPath });
      if (result?.uri) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(result.uri));
        const editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(result.line || 0, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
      }
    } catch { /* silently fail */ }
  }

  /**
   * Insert API call at cursor
   * @param {string} endpointPath
   */
  async _insertApiCall(endpointPath) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showErrorMessage("No active editor"); return; }
    await editor.insertSnippet(new vscode.SnippetString(`api.${endpointPath}(\${1})`));
  }

  /**
   * Post message to webview
   * @param {Object} message
   */
  _postMessage(message) { if (this._view) this._view.webview.postMessage(message); }

  /**
   * Get HTML content
   * @param {vscode.Webview} webview
   * @returns {string}
   */
  _getHtmlContent(webview) {
    return getToolsTemplate({
      cssUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews", "tools.css")),
      jsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews", "tools.js")),
      cspSource: webview.cspSource,
      nonce: this._getNonce(),
    });
  }

  /**
   * Generate nonce for CSP
   * @returns {string}
   */
  _getNonce() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
}

module.exports = { ToolsProvider };
