/**
 * @fileoverview Root component for the Gamified Hub panel
 * Manages state and coordinates child components
 */

customElements.define(
  'ape-hub',
  class extends hyperElement {
    /**
     * Initialize component state and event handlers
     * @param {Function} attachStore - Store attachment function from hyper-element
     * @returns {Function} Cleanup function
     */
    setup(attachStore) {
      this.vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

      this.state = {
        summary: null,
        activeQuest: null,
        questProgress: null,
        badges: {},
        skillTrees: { client: [], server: [] },
        skillsExpanded: false,
        modals: {
          badge: { open: false },
          quest: { open: false, quest: null, step: 0 }
        },
        toast: {
          visible: false,
          badge: null,
          xpEarned: 0,
          leveledUp: false,
          newLevel: 0
        },
        validationResults: null
      };

      this.onStoreChange = attachStore(() => this.state);

      // Message handler for VS Code extension communication
      this.messageHandler = (e) => this.handleMessage(e.data);
      window.addEventListener('message', this.messageHandler);

      // Event delegation for custom element events (hyper-element reserves on* for native elements)
      // In hyper-element setup(), 'this' is a wrapper object - use 'this.element' for DOM methods
      this.customEventHandler = (e) => this.handleCustomEvent(e);
      const customEvents = [
        'track-select', 'view-badges', 'continue-quest', 'skip-quest', 'suggest-quest',
        'toggle', 'skill-click', 'close', 'badge-click', 'prev-step', 'next-step',
        'check-step', 'copy-code', 'open-editor'
      ];
      customEvents.forEach(event => this.element.addEventListener(event, this.customEventHandler));

      if (this.vscode) this.vscode.postMessage({ command: 'ready' });

      return () => {
        window.removeEventListener('message', this.messageHandler);
        customEvents.forEach(event => this.element.removeEventListener(event, this.customEventHandler));
      };
    }

    /**
     * Route custom events from child components to handlers
     * @param {CustomEvent} e - Custom event from child component
     */
    handleCustomEvent(e) {
      const { type, detail } = e;
      const handlers = {
        'track-select': () => this.selectTrack(detail.track),
        'view-badges': () => this.postMessage({ command: 'viewBadges' }),
        'continue-quest': () => this.continueQuest(),
        'skip-quest': () => this.skipQuest(),
        'suggest-quest': () => this.suggestQuest(),
        'toggle': () => this.toggleSkills(),
        'skill-click': () => this.startQuestForBadge(detail.nodeId),
        'close': () => this.closeModals(),
        'badge-click': () => this.startQuestForBadge(detail.badgeId),
        'prev-step': () => this.setQuestStep(this.state.modals.quest.step - 1),
        'next-step': () => this.completeQuestStep(),
        'check-step': () => this.completeQuestStep(),
        'copy-code': () => this.postMessage({ command: 'copyCode', code: detail.code }),
        'open-editor': () => this.postMessage({ command: 'openInEditor', code: detail.code, filename: 'example.js' }),
      };
      handlers[type]?.();
    }

    /**
     * Handle messages from VS Code extension
     * @param {Object} msg - Message with command and data
     */
    handleMessage(msg) {
      switch (msg.command) {
        case 'updateState':
          if (msg.state) {
            Object.assign(this.state, {
              summary: msg.state.summary,
              activeQuest: msg.state.activeQuest,
              questProgress: msg.state.questProgress,
              badges: msg.state.badges || {},
              skillTrees: msg.state.skillTrees || { client: [], server: [] }
            });
            this.onStoreChange();
          }
          break;
        case 'showBadgeModal':
          this.state.badges = msg.badges;
          this.state.modals.badge = { open: true };
          this.onStoreChange();
          break;
        case 'showQuestPanel':
          this.state.modals.quest = {
            open: true,
            quest: msg.quest,
            step: msg.currentStep || 0
          };
          this.state.validationResults = null;
          this.onStoreChange();
          break;
        case 'showBadgeUnlock':
          this.state.toast = {
            visible: true,
            badge: msg.badge,
            xpEarned: msg.xpEarned,
            leveledUp: msg.leveledUp,
            newLevel: msg.newLevel
          };
          this.onStoreChange();
          // Auto-hide after 4 seconds
          setTimeout(() => {
            this.state.toast.visible = false;
            this.onStoreChange();
          }, 4000);
          break;
        case 'validationFailed':
          this.state.validationResults = msg.results;
          this.onStoreChange();
          break;
      }
    }

    /**
     * Send message to VS Code extension
     * @param {Object} message - Message to send
     */
    postMessage(message) { if (this.vscode) this.vscode.postMessage(message); }
    /**
     * Select a learning track
     * @param {string} track - Track identifier
     */
    selectTrack(track) { this.postMessage({ command: 'selectTrack', track }); }
    /** Continue the active quest */
    continueQuest() { if (this.state.activeQuest) this.postMessage({ command: 'continueQuest', questId: this.state.activeQuest.id }); }
    /** Skip the current quest */
    skipQuest() { this.postMessage({ command: 'skipQuest' }); }
    /** Find and suggest the next available quest */
    suggestQuest() {
      const quests = ['first-controller', 'error-handling', 'broadcast-master', 'first-subscription', 'first-publish', 'connection-handling', 'connection-states', 'file-upload', 'lifecycle-hooks', 'controller-context', 'basic-auth', 'mfa-setup', 'tier-2-auth', 'tier-3-auth', 'custom-plugin', 'forest-setup', 'cluster-deployment'];
      const completed = this.state.summary?.completedQuests || [];
      for (const qid of quests) { if (!completed.includes(qid)) { this.postMessage({ command: 'startQuest', questId: qid }); return; } }
      alert("All quests complete! You've mastered api-ape!");
    }

    /**
     * Start quest for a specific badge
     * @param {string} badgeId - Badge to start quest for
     */
    startQuestForBadge(badgeId) {
      const badge = Object.values(this.state.badges || {}).flatMap((cat) => cat.badges || []).find((b) => b.id === badgeId);
      if (badge && !badge.earned && badge.requirements?.questId) { this.closeModals(); this.postMessage({ command: 'startQuest', questId: badge.requirements.questId }); }
    }
    /** Toggle skill trees expanded/collapsed */
    toggleSkills() { this.state.skillsExpanded = !this.state.skillsExpanded; this.onStoreChange(); }
    /** Close all open modals */
    closeModals() { this.state.modals = { badge: { open: false }, quest: { open: false, quest: null, step: 0 } }; this.state.validationResults = null; this.onStoreChange(); }
    /**
     * Set current quest step
     * @param {number} step - Step index
     */
    setQuestStep(step) { this.state.modals.quest.step = step; this.state.validationResults = null; this.onStoreChange(); }
    /** Complete current quest step and notify extension */
    completeQuestStep() { const { quest, step } = this.state.modals.quest; if (quest) this.postMessage({ command: 'completeQuestStep', questId: quest.id, stepIndex: step }); }
    /**
     * Render the hub panel
     * @param {Function} Html - hyperHTML tagged template function
     * @param {Object} state - Component state
     * @returns {void|*} Early return for loading state
     */
    render(Html, state) {
      if (!state.summary) {
        return Html`<div id="app"><div id="level-card"><div id="level-title">Loading...</div></div></div>`;
      }

      Html`
        <div id="app">
          <ape-level-card
            data-summary='${JSON.stringify(state.summary)}'>
          </ape-level-card>

          <ape-quest-section
            data-quest='${JSON.stringify(state.activeQuest)}'
            data-progress='${JSON.stringify(state.questProgress)}'>
          </ape-quest-section>

          <ape-skills-section
            data-trees='${JSON.stringify(state.skillTrees)}'
            data-expanded="${state.skillsExpanded}">
          </ape-skills-section>
        </div>

        ${state.modals.badge.open
          ? Html.wire(this, ':badge-modal')`
            <ape-modal-backdrop></ape-modal-backdrop>
            <ape-badge-modal
              data-badges='${JSON.stringify(state.badges)}'>
            </ape-badge-modal>
          `
          : ''}

        ${state.modals.quest.open
          ? Html.wire(this, ':quest-modal')`
            <ape-modal-backdrop></ape-modal-backdrop>
            <ape-quest-modal
              data-quest='${JSON.stringify(state.modals.quest.quest)}'
              data-step="${state.modals.quest.step}"
              data-validation='${JSON.stringify(state.validationResults)}'>
            </ape-quest-modal>
          `
          : ''}

        ${state.toast.visible
          ? Html.wire(this, ':toast')`
            <ape-badge-toast
              data-badge='${JSON.stringify(state.toast.badge)}'
              data-xp="${state.toast.xpEarned}"
              data-leveled-up="${state.toast.leveledUp}"
              data-new-level="${state.toast.newLevel}">
            </ape-badge-toast>
          `
          : ''}
      `;
    }
  }
);
