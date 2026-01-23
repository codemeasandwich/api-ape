/**
 * @fileoverview Badge Unlock Checker
 * Monitors for badge unlock conditions and triggers unlocks.
 */

const vscode = require("vscode");

class BadgeUnlockChecker {
  /**
   * @param {Object} badges - Badge definitions from badges.json
   * @param {import('./ProgressService').ProgressService} progressService
   * @param {import('./ActionTracker').ActionTracker} actionTracker
   */
  constructor(badges, progressService, actionTracker) {
    this.badges = badges;
    this.progressService = progressService;
    this.actionTracker = actionTracker;

    this._onBadgeEligible = new vscode.EventEmitter();
    this.onBadgeEligible = this._onBadgeEligible.event;

    // Listen to action tracker events
    this._actionDisposable = this.actionTracker.onActionTracked((event) => {
      if (event.action !== "reset") {
        this._checkActionBadges(event.action, event.count);
      }
    });

    // Listen to progress events for quest-based badges
    this._progressDisposable = this.progressService.onProgressChanged((event) => {
      if (event.type === "questComplete") {
        this._checkQuestBadges(event.questId);
      }
    });
  }

  /**
   * Check all badges for unlock eligibility
   * @returns {string[]} - Array of eligible badge IDs
   */
  checkAllBadges() {
    const eligible = [];

    for (const [badgeId, badge] of Object.entries(this.badges)) {
      if (this.progressService.hasBadge(badgeId)) {
        continue; // Already earned
      }

      if (this._checkBadgeRequirements(badge)) {
        eligible.push(badgeId);
      }
    }

    return eligible;
  }

  /**
   * Check if a badge's requirements are met
   * @param {Object} badge
   * @returns {boolean}
   */
  _checkBadgeRequirements(badge) {
    const { requirements } = badge;
    if (!requirements) return false;

    switch (requirements.type) {
      case "action":
        return this.actionTracker.isActionMet(requirements.action, requirements.count || 1);

      case "quest":
        return this.progressService.isQuestCompleted(requirements.questId);

      case "manual":
        return false; // Manual badges require explicit unlock

      default:
        return false;
    }
  }

  /**
   * Check action-based badges when an action is tracked
   * @param {string} action
   * @param {number} count
   */
  _checkActionBadges(action, count) {
    for (const [badgeId, badge] of Object.entries(this.badges)) {
      if (this.progressService.hasBadge(badgeId)) continue;

      const { requirements } = badge;
      if (requirements?.type === "action" && requirements.action === action) {
        const requiredCount = requirements.count || 1;
        if (count >= requiredCount) {
          this._onBadgeEligible.fire({ badgeId, badge, trigger: "action" });
        }
      }
    }
  }

  /**
   * Check quest-based badges when a quest completes
   * @param {string} questId
   */
  _checkQuestBadges(questId) {
    for (const [badgeId, badge] of Object.entries(this.badges)) {
      if (this.progressService.hasBadge(badgeId)) continue;

      const { requirements } = badge;
      if (requirements?.type === "quest" && requirements.questId === questId) {
        this._onBadgeEligible.fire({ badgeId, badge, trigger: "quest" });
      }
    }
  }

  /** Dispose of resources */
  dispose() {
    this._onBadgeEligible.dispose();
    this._actionDisposable.dispose();
    this._progressDisposable.dispose();
  }
}

module.exports = { BadgeUnlockChecker };
