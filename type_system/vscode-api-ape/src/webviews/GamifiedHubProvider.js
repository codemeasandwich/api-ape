/**
 * @fileoverview Gamified Learning Hub webview provider
 */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { getHubTemplate } = require("./hub.template");
const { QuestValidator } = require("../services/QuestValidator");
const { BadgeUnlockChecker } = require("../services/BadgeUnlockChecker");

class GamifiedHubProvider {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('../services/ProgressService').ProgressService} progressService
   * @param {import('../services/ActionTracker').ActionTracker} [actionTracker]
   */
  constructor(context, progressService, actionTracker) {
    this.context = context;
    this.progressService = progressService;
    this.actionTracker = actionTracker;
    this._view = undefined;
    this.badges = this._loadJson("badges.json");
    this.quests = this._loadJson("quests.json");
    this.progressService.onProgressChanged(() => this._updateWebview());

    // Initialize quest validator if actionTracker is provided
    if (actionTracker) {
      this.questValidator = new QuestValidator(context, actionTracker);
      this.badgeUnlockChecker = new BadgeUnlockChecker(this.badges, progressService, actionTracker);

      // Listen for badge eligibility from action-based badges
      this.badgeUnlockChecker.onBadgeEligible((event) => {
        this._handleBadgeEligible(event);
      });
    }
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
        vscode.Uri.joinPath(this.context.extensionUri, "media", "badges"),
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
      case "copyCode":
        await vscode.env.clipboard.writeText(message.code);
        vscode.window.showInformationMessage("Code copied to clipboard!");
        break;
      case "openInEditor": await this._openCodeInEditor(message.code, message.filename); break;
      case "resetProgress":
        if (await vscode.window.showWarningMessage("Reset all progress?", { modal: true }, "Reset") === "Reset") {
          this.progressService.resetProgress();
          if (this.actionTracker) {
            this.actionTracker.resetActions();
          }
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
      },
    });
  }

  /**
   * Get badge data with earned status
   * @returns {Object}
   */
  _getBadgeData() {
    const earnedBadges = this.progressService.getBadges();
    const categories = { fundamentals: { name: "Fundamentals", badges: [] }, realtime: { name: "Real-time", badges: [] }, security: { name: "Security", badges: [] }, advanced: { name: "Advanced", badges: [] } };
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
   * Complete a quest step with validation
   * @param {string} questId
   * @param {number} stepIndex
   */
  async _completeQuestStep(questId, stepIndex) {
    const quest = this.quests[questId];
    if (!quest) return;

    const step = quest.steps[stepIndex];

    // Validate step requirements if validator is available and step has validators
    if (this.questValidator && step.validators && step.validators.length > 0) {
      const validation = await this.questValidator.validateStep(step.validators);

      if (!validation.valid) {
        // Send validation failure to webview
        this._postMessage({
          command: "validationFailed",
          questId,
          stepIndex,
          results: validation.results,
        });
        return;
      }
    }

    // Step validated - proceed
    const nextStep = stepIndex + 1;
    if (nextStep >= quest.steps.length) {
      // Quest complete
      this.progressService.completeQuest(questId);

      if (quest.badgeId) {
        const badge = this.badges[quest.badgeId];
        const xpReward = badge?.xpReward || quest.xpReward;
        const result = this.progressService.unlockBadge(quest.badgeId, xpReward);

        if (!result.alreadyHad) {
          this._postMessage({
            command: "showBadgeUnlock",
            badge: this.badges[quest.badgeId],
            xpEarned: xpReward,
            leveledUp: result.xpResult?.leveledUp,
            newLevel: result.xpResult?.newLevel,
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
   * Handle badge eligibility from BadgeUnlockChecker
   * @param {{badgeId: string, badge: Object, trigger: string}} event
   */
  _handleBadgeEligible(event) {
    const { badgeId, badge, trigger } = event;

    // For action-based badges, auto-unlock
    if (trigger === "action") {
      const result = this.progressService.unlockBadge(badgeId, badge.xpReward);

      if (!result.alreadyHad) {
        this._postMessage({
          command: "showBadgeUnlock",
          badge,
          xpEarned: badge.xpReward,
          leveledUp: result.xpResult?.leveledUp,
          newLevel: result.xpResult?.newLevel,
        });
        this._updateWebview();
      }
    }
    // Quest-based badges are handled in _completeQuestStep
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
      badgeSvgsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webviews", "badgeSvgs.js")),
      badgesUri: webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "badges")),
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
