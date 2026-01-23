/**
 * @fileoverview Gamified Learning Hub webview provider
 */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { getHubTemplate } = require("./hub.template");

class GamifiedHubProvider {
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
    this.badges = this._loadJson("badges.json");
    this.quests = this._loadJson("quests.json");
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
      case "selectTrack": this.progressService.setTrack(message.track); break;
      case "startQuest": this.progressService.setActiveQuest(message.questId); this._updateWebview(); break;
      case "skipQuest": this.progressService.setActiveQuest(null); this._updateWebview(); break;
      case "continueQuest": this._showQuestPanel(message.questId); break;
      case "completeQuestStep": await this._completeQuestStep(message.questId, message.stepIndex); break;
      case "unlockBadge": this._unlockBadge(message.badgeId); break;
      case "viewBadges": this._postMessage({ command: "showBadgeModal", badges: this._getBadgeData() }); break;
      case "toggleTools": this._postMessage({ command: "toggleToolsPanel" }); break;
      case "refreshEndpoints": await this._refreshEndpoints(); break;
      case "generateTypes": await vscode.commands.executeCommand("apiApe.generateTypes"); break;
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
      case "openInEditor": await this._openCodeInEditor(message.code, message.filename); break;
      case "goToEndpoint": await this._goToEndpoint(message.path); break;
      case "insertApiCall": await this._insertApiCall(message.path); break;
      case "resetProgress":
        if (await vscode.window.showWarningMessage("Reset all progress?", { modal: true }, "Reset") === "Reset") {
          this.progressService.resetProgress();
          vscode.window.showInformationMessage("Progress reset!");
        }
        break;
    }
  }

  /** Update the webview with current state */
  _updateWebview() {
    if (!this._view) return;
    const summary = this.progressService.getSummary(this.badges, this.quests);
    const activeQuest = summary.activeQuest ? this.quests[summary.activeQuest] : null;
    this._postMessage({
      command: "updateState",
      state: {
        summary, activeQuest,
        questProgress: activeQuest ? this.progressService.getQuest(summary.activeQuest) : null,
        badges: this._getBadgeData(),
        skillTrees: this._getSkillTrees(),
        recentRecaps: this.progressService.getRecentRecaps().map((id) => this.recaps[id]).filter(Boolean),
        bookmarkedRecaps: this.progressService.getBookmarkedRecaps(),
      },
    });
  }

  /**
   * Get badge data with earned status
   * @returns {Object}
   */
  _getBadgeData() {
    const earnedBadges = this.progressService.getBadges();
    const categories = {
      fundamentals: { name: "Fundamentals", badges: [] },
      realtime: { name: "Real-time", badges: [] },
      security: { name: "Security", badges: [] },
      advanced: { name: "Advanced", badges: [] },
    };
    for (const [id, badge] of Object.entries(this.badges)) {
      if (categories[badge.category]) {
        categories[badge.category].badges.push({
          ...badge, earned: earnedBadges.includes(id), inProgress: this._isBadgeInProgress(id),
        });
      }
    }
    return categories;
  }

  /**
   * Check if badge is in progress
   * @param {string} badgeId
   * @returns {boolean}
   */
  _isBadgeInProgress(badgeId) {
    const badge = this.badges[badgeId];
    if (!badge || badge.requirements.type !== "quest") return false;
    const quest = this.progressService.getQuest(badge.requirements.questId);
    return quest.currentStep > 0 && !quest.completed;
  }

  /**
   * Get skill tree data for visualization
   * @returns {Object}
   */
  _getSkillTrees() {
    const earnedBadges = this.progressService.getBadges();
    const clientNodes = [
      { id: "rpc-rookie", label: "RPC", x: 0 }, { id: "subscriber", label: "Sub", x: 1 },
      { id: "file-uploader", label: "File", x: 2 }, { id: "connection-pro", label: "Conn", x: 3 },
      { id: "state-manager", label: "State", x: 4 },
    ];
    const serverNodes = [
      { id: "controller-creator", label: "Ctrl", x: 0 }, { id: "publisher", label: "Pub", x: 1 },
      { id: "broadcaster", label: "Brod", x: 2 }, { id: "hook-master", label: "Hook", x: 3 },
      { id: "context-expert", label: "Cntx", x: 4 },
    ];
    /**
     * Map nodes with earned/inProgress status
     * @param {Array} nodes
     * @returns {Array}
     */
    const mapNodes = (nodes) => nodes.map((node) => ({
      ...node, earned: earnedBadges.includes(node.id), inProgress: this._isBadgeInProgress(node.id),
    }));
    return { client: mapNodes(clientNodes), server: mapNodes(serverNodes) };
  }

  /**
   * Show quest panel
   * @param {string} questId
   */
  _showQuestPanel(questId) {
    const quest = this.quests[questId];
    if (!quest) return;
    this._postMessage({ command: "showQuestPanel", quest, currentStep: this.progressService.getQuest(questId).currentStep });
  }

  /**
   * Complete a quest step
   * @param {string} questId
   * @param {number} stepIndex
   */
  async _completeQuestStep(questId, stepIndex) {
    const quest = this.quests[questId];
    if (!quest) return;
    const nextStep = stepIndex + 1;
    if (nextStep >= quest.steps.length) {
      this.progressService.completeQuest(questId);
      if (quest.badgeId) {
        const result = this.progressService.unlockBadge(quest.badgeId, quest.xpReward);
        if (!result.alreadyHad) {
          this._postMessage({
            command: "showBadgeUnlock", badge: this.badges[quest.badgeId],
            xpEarned: quest.xpReward, leveledUp: result.xpResult?.leveledUp, newLevel: result.xpResult?.newLevel,
          });
        }
      }
      this.progressService.setActiveQuest(null);
    } else {
      this.progressService.updateQuestStep(questId, nextStep);
    }
    this._updateWebview();
  }

  /**
   * Unlock a badge
   * @param {string} badgeId
   */
  _unlockBadge(badgeId) {
    const badge = this.badges[badgeId];
    if (!badge) return;
    const result = this.progressService.unlockBadge(badgeId, badge.xpReward);
    if (!result.alreadyHad) {
      this._postMessage({
        command: "showBadgeUnlock", badge,
        xpEarned: badge.xpReward, leveledUp: result.xpResult?.leveledUp, newLevel: result.xpResult?.newLevel,
      });
    }
    this._updateWebview();
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
   * Open code in a new editor
   * @param {string} code
   * @param {string} filename
   */
  async _openCodeInEditor(code, filename) {
    const doc = await vscode.workspace.openTextDocument({ content: code, language: filename.endsWith(".ts") ? "typescript" : "javascript" });
    await vscode.window.showTextDocument(doc, { preview: true });
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
    return getHubTemplate({
      cssUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews", "hub.css")),
      jsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews", "hub.js")),
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

module.exports = { GamifiedHubProvider };
