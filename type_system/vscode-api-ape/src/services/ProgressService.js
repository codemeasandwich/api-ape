/**
 * @fileoverview Global progress tracking for badges, XP, and learning paths
 *
 * Uses VS Code's globalState API for cross-workspace persistence.
 */

const vscode = require("vscode");

/** @type {number[]} XP required to reach each level (1-10) */
const LEVEL_THRESHOLDS = [0, 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 12000];

/** @type {string[]} */
const LEVEL_TITLES = ["Newbie", "Apprentice", "Explorer", "Developer", "API Explorer", "Practitioner", "Expert", "Master", "Architect", "Legend"];

class ProgressService {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.state = context.globalState;
    this._onProgressChanged = new vscode.EventEmitter();
    this.onProgressChanged = this._onProgressChanged.event;
  }

  // ========== XP & LEVELING ==========

  /**
   * Get current XP
   * @returns {number}
   */
  getXP() {
    return this.state.get("apiApe.xp", 0);
  }

  /**
   * Add XP and check for level up
   * @param {number} amount
   * @returns {{newXP: number, leveledUp: boolean, newLevel: number}}
   */
  addXP(amount) {
    const oldLevel = this.getLevel();
    const newXP = this.getXP() + amount;
    this.state.update("apiApe.xp", newXP);

    const newLevel = this.getLevel();
    const leveledUp = newLevel > oldLevel;

    this._onProgressChanged.fire({ type: "xp", xp: newXP, leveledUp, newLevel });

    return { newXP, leveledUp, newLevel };
  }

  /**
   * Get current level based on XP
   * @returns {number}
   */
  getLevel() {
    const xp = this.getXP();
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Get level title
   * @param {number} [level] - Optional level, defaults to current
   * @returns {string}
   */
  getLevelTitle(level) {
    const lvl = level || this.getLevel();
    return LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)];
  }

  /**
   * Get XP progress to next level
   * @returns {{current: number, required: number, percentage: number}}
   */
  getLevelProgress() {
    const xp = this.getXP();
    const level = this.getLevel();
    const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
    const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

    const current = xp - currentThreshold;
    const required = nextThreshold - currentThreshold;
    const percentage = Math.min(100, Math.round((current / required) * 100));

    return { current, required, percentage };
  }

  // ========== BADGES ==========

  /**
   * Get all earned badges
   * @returns {string[]}
   */
  getBadges() {
    return this.state.get("apiApe.badges", []);
  }

  /**
   * Check if a badge is earned
   * @param {string} badgeId
   * @returns {boolean}
   */
  hasBadge(badgeId) {
    return this.getBadges().includes(badgeId);
  }

  /**
   * Unlock a badge
   * @param {string} badgeId
   * @param {number} [xpReward=0] - XP to award for earning the badge
   * @returns {{alreadyHad: boolean, xpResult?: object}}
   */
  unlockBadge(badgeId, xpReward = 0) {
    const badges = this.getBadges();
    if (badges.includes(badgeId)) {
      return { alreadyHad: true };
    }

    badges.push(badgeId);
    this.state.update("apiApe.badges", badges);

    let xpResult;
    if (xpReward > 0) {
      xpResult = this.addXP(xpReward);
    }

    this._onProgressChanged.fire({ type: "badge", badgeId });

    return { alreadyHad: false, xpResult };
  }

  // ========== QUEST PROGRESS ==========

  /**
   * Get all quest progress data
   * @returns {Object.<string, {currentStep: number, completed: boolean, stepData: Object}>}
   */
  getQuestProgress() {
    return this.state.get("apiApe.questProgress", {});
  }

  /**
   * Get progress for a specific quest
   * @param {string} questId
   * @returns {{currentStep: number, completed: boolean, stepData: Object}}
   */
  getQuest(questId) {
    const progress = this.getQuestProgress();
    return progress[questId] || { currentStep: 0, completed: false, stepData: {} };
  }

  /**
   * Update quest progress
   * @param {string} questId
   * @param {number} step
   * @param {Object} [stepData]
   */
  updateQuestStep(questId, step, stepData = {}) {
    const progress = this.getQuestProgress();
    const quest = progress[questId] || { currentStep: 0, completed: false, stepData: {} };

    quest.currentStep = step;
    quest.stepData = { ...quest.stepData, ...stepData };
    progress[questId] = quest;

    this.state.update("apiApe.questProgress", progress);
    this._onProgressChanged.fire({ type: "quest", questId, step });
  }

  /**
   * Mark quest as completed
   * @param {string} questId
   */
  completeQuest(questId) {
    const progress = this.getQuestProgress();
    const quest = progress[questId] || { currentStep: 0, completed: false, stepData: {} };

    quest.completed = true;
    progress[questId] = quest;

    this.state.update("apiApe.questProgress", progress);
    this._onProgressChanged.fire({ type: "questComplete", questId });
  }

  /**
   * Check if quest is completed
   * @param {string} questId
   * @returns {boolean}
   */
  isQuestCompleted(questId) {
    return this.getQuest(questId).completed;
  }

  // ========== ACTIVE QUEST ==========

  /**
   * Get the currently active quest
   * @returns {string|null}
   */
  getActiveQuest() {
    return this.state.get("apiApe.activeQuest", null);
  }

  /**
   * Set the active quest
   * @param {string|null} questId
   */
  setActiveQuest(questId) {
    this.state.update("apiApe.activeQuest", questId);
    this._onProgressChanged.fire({ type: "activeQuest", questId });
  }

  // ========== DEVELOPER TRACK ==========

  /**
   * Get selected developer track
   * @returns {"client"|"server"|null}
   */
  getTrack() {
    return this.state.get("apiApe.track", null);
  }

  /**
   * Set developer track
   * @param {"client"|"server"} track
   */
  setTrack(track) {
    this.state.update("apiApe.track", track);
    this._onProgressChanged.fire({ type: "track", track });
  }

  // ========== RECAPS ==========

  /**
   * Get bookmarked recaps
   * @returns {string[]}
   */
  getBookmarkedRecaps() {
    return this.state.get("apiApe.bookmarkedRecaps", []);
  }

  /**
   * Toggle bookmark on a recap
   * @param {string} recapId
   * @returns {boolean} - New bookmark state
   */
  toggleRecapBookmark(recapId) {
    const bookmarks = this.getBookmarkedRecaps();
    const index = bookmarks.indexOf(recapId);

    if (index === -1) {
      bookmarks.push(recapId);
    } else {
      bookmarks.splice(index, 1);
    }

    this.state.update("apiApe.bookmarkedRecaps", bookmarks);
    return index === -1;
  }

  /**
   * Get recently viewed recaps
   * @returns {string[]}
   */
  getRecentRecaps() {
    return this.state.get("apiApe.recentRecaps", []);
  }

  /**
   * Add a recap to recent history
   * @param {string} recapId
   */
  addRecentRecap(recapId) {
    const recent = this.getRecentRecaps();
    const index = recent.indexOf(recapId);

    if (index !== -1) {
      recent.splice(index, 1);
    }
    recent.unshift(recapId);

    // Keep only last 10
    if (recent.length > 10) {
      recent.pop();
    }

    this.state.update("apiApe.recentRecaps", recent);
  }

  // ========== SUMMARY STATS ==========

  /**
   * Get overall progress summary
   * @param {Object} badges - Badge definitions
   * @param {Object} quests - Quest definitions
   * @returns {Object}
   */
  getSummary(badges, quests) {
    const earnedBadges = this.getBadges();
    const questProgress = this.getQuestProgress();
    const track = this.getTrack();

    // Calculate track-specific progress
    const clientBadges = Object.entries(badges)
      .filter(([_, b]) => b.track === "client" || b.track === "both")
      .map(([id]) => id);
    const serverBadges = Object.entries(badges)
      .filter(([_, b]) => b.track === "server" || b.track === "both")
      .map(([id]) => id);

    const clientEarned = clientBadges.filter((id) => earnedBadges.includes(id)).length;
    const serverEarned = serverBadges.filter((id) => earnedBadges.includes(id)).length;

    return {
      xp: this.getXP(),
      level: this.getLevel(),
      levelTitle: this.getLevelTitle(),
      levelProgress: this.getLevelProgress(),
      track,
      totalBadges: earnedBadges.length,
      clientProgress: Math.round((clientEarned / clientBadges.length) * 100),
      serverProgress: Math.round((serverEarned / serverBadges.length) * 100),
      completedQuests: Object.values(questProgress).filter((q) => q.completed).length,
      activeQuest: this.getActiveQuest(),
    };
  }

  /**
   * Reset all progress (for testing/debugging)
   */
  resetProgress() {
    this.state.update("apiApe.xp", 0);
    this.state.update("apiApe.badges", []);
    this.state.update("apiApe.questProgress", {});
    this.state.update("apiApe.activeQuest", null);
    this.state.update("apiApe.track", null);
    this.state.update("apiApe.bookmarkedRecaps", []);
    this.state.update("apiApe.recentRecaps", []);
    this._onProgressChanged.fire({ type: "reset" });
  }

  /** Dispose of resources */
  dispose() {
    this._onProgressChanged.dispose();
  }
}

module.exports = { ProgressService, LEVEL_THRESHOLDS, LEVEL_TITLES };
