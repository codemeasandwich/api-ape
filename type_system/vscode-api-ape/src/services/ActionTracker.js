/**
 * @fileoverview Action Tracker Service
 * Tracks user actions for badge unlock triggers and quest validation.
 */

const vscode = require("vscode");

class ActionTracker {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.state = context.globalState;
    this._onActionTracked = new vscode.EventEmitter();
    this.onActionTracked = this._onActionTracked.event;
  }

  /**
   * Get all tracked action counts
   * @returns {Object.<string, number>}
   */
  getActions() {
    return this.state.get("apiApe.actionCounts", {});
  }

  /**
   * Get count for a specific action
   * @param {string} action
   * @returns {number}
   */
  getActionCount(action) {
    return this.getActions()[action] || 0;
  }

  /**
   * Track an action occurrence
   * @param {string} action - Action identifier (e.g., "api-call", "generate-types")
   * @param {number} [increment=1] - Amount to increment
   * @returns {{action: string, newCount: number}}
   */
  trackAction(action, increment = 1) {
    const actions = this.getActions();
    const newCount = (actions[action] || 0) + increment;
    actions[action] = newCount;
    this.state.update("apiApe.actionCounts", actions);

    this._onActionTracked.fire({ action, count: newCount });

    return { action, newCount };
  }

  /**
   * Check if action requirement is met
   * @param {string} action
   * @param {number} [requiredCount=1]
   * @returns {boolean}
   */
  isActionMet(action, requiredCount = 1) {
    return this.getActionCount(action) >= requiredCount;
  }

  /**
   * Reset all action counts
   */
  resetActions() {
    this.state.update("apiApe.actionCounts", {});
    this._onActionTracked.fire({ action: "reset", count: 0 });
  }

  /** Dispose of resources */
  dispose() {
    this._onActionTracked.dispose();
  }
}

module.exports = { ActionTracker };
