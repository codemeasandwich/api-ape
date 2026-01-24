/**
 * @fileoverview Quest section with active quest card or empty state
 */

customElements.define(
  'ape-quest-section',
  class extends hyperElement {
    /**
     * Render quest section with active quest or empty state
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const quest = this.dataset.quest ? JSON.parse(this.dataset.quest) : null;
      const progress = this.dataset.progress ? JSON.parse(this.dataset.progress) : null;

      Html`
        <div class="section">
          <div class="section-header">CURRENT QUEST</div>
          ${quest
            ? Html.wire(this, ':quest-card')`
              <ape-quest-card
                quest=${quest}
                progress=${progress}>
              </ape-quest-card>
            `
            : Html.wire(this, ':no-quest')`
              <ape-no-quest-card>
              </ape-no-quest-card>
            `}
        </div>
      `;
    }
  }
);

/**
 * Active quest card with progress
 */
customElements.define(
  'ape-quest-card',
  class extends hyperElement {
    /**
     * Render quest card with title, description, and progress
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const quest = this.quest || {};
      const progress = this.progress || {};
      const currentStep = progress.currentStep || 0;
      const totalSteps = quest.steps?.length || 1;
      const pct = Math.round((currentStep / totalSteps) * 100);

      Html`
        <div class="card quest-card">
          <div class="quest-title"><span>!</span> ${quest.title}</div>
          <div class="quest-description">${quest.description}</div>
          <div class="quest-progress">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${pct}%"></div>
            </div>
            <span class="quest-progress-text">${currentStep}/${totalSteps}</span>
          </div>
          <div class="quest-actions">
            <button class="btn primary" onclick=${() => this.handleContinue()}>
              Continue
            </button>
            <button class="btn secondary" onclick=${() => this.handleSkip()}>
              Skip
            </button>
          </div>
        </div>
      `;
    }

    /** Dispatch continue-quest event */
    handleContinue() {
      this.element.dispatchEvent(new CustomEvent('continue-quest', { bubbles: true }));
    }

    /** Dispatch skip-quest event */
    handleSkip() {
      this.element.dispatchEvent(new CustomEvent('skip-quest', { bubbles: true }));
    }
  }
);

/**
 * Empty state card when no quest is active
 */
customElements.define(
  'ape-no-quest-card',
  class extends hyperElement {
    /**
     * Render empty state with suggest quest button
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      Html`
        <div class="card no-quest-card">
          <div class="no-quest-text">Select a quest to begin</div>
          <button class="btn primary" onclick=${() => this.handleSuggest()}>
            Suggest Quest
          </button>
        </div>
      `;
    }

    /** Dispatch suggest-quest event */
    handleSuggest() {
      this.element.dispatchEvent(new CustomEvent('suggest-quest', { bubbles: true }));
    }
  }
);
