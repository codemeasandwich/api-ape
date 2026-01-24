/**
 * @fileoverview Quest step-by-step modal
 */

/**
 * Get validator label for display
 * @param {Object} v - Validator object
 * @returns {string} Human-readable label
 */
function getValidatorLabel(v) {
  switch (v.type) {
    case 'file-exists':
      return 'File created';
    case 'code-contains':
      return `Contains ${v.pattern}`;
    case 'endpoint-called':
      return 'Endpoint tested';
    case 'manual':
      return 'Manual verify';
    default:
      return v.type;
  }
}

customElements.define(
  'ape-quest-modal',
  class extends hyperElement {
    /**
     * Render quest modal with step navigation
     * @param {Function} Html - hyperHTML tagged template function
     * @returns {void|*} Early return for empty quest state
     */
    render(Html) {
      const quest = this.dataset.quest ? JSON.parse(this.dataset.quest) : null;
      const stepIndex = parseInt(this.dataset.step, 10) || 0;
      const validation = this.dataset.validation ? JSON.parse(this.dataset.validation) : null;

      if (!quest) {
        return Html`<div class="modal hidden"></div>`;
      }

      const step = quest.steps?.[stepIndex];
      const total = quest.steps?.length || 1;
      const isLastStep = stepIndex === total - 1;
      const isChallenge = step?.type === 'challenge';

      Html`
        <div class="modal">
          <div class="modal-header">
            <span>${quest.title}</span>
            <button class="modal-close" onclick=${() => this.handleClose()}>&times;</button>
          </div>
          <div class="modal-content">
            <div class="quest-step">
              <div class="quest-step-header">STEP ${stepIndex + 1} OF ${total}</div>
              <div class="quest-step-title">${step?.title}</div>

              ${step?.type === 'concept' || step?.type === 'complete'
                ? Html.wire(this, ':concept')`
                  <div class="quest-concept">${step.content}</div>
                  ${step.codeExample
                    ? Html.wire(this, ':code')`
                      <div class="quest-code">
                        <pre>${step.codeExample}</pre>
                      </div>
                      <div class="quest-code-actions">
                        <button class="btn secondary" onclick=${() => this.handleCopy(step.codeExample)}>
                          Copy
                        </button>
                        <button class="btn secondary" onclick=${() => this.handleOpenEditor(step.codeExample)}>
                          Open
                        </button>
                      </div>
                    `
                    : ''}
                `
                : ''}

              ${isChallenge
                ? Html.wire(this, ':challenge')`
                  <div class="quest-challenge">
                    <div class="quest-challenge-title">CHALLENGE</div>
                    <div>${step.description}</div>
                    ${step.hint
                      ? Html.wire(this, ':hint')`
                        <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">
                          Hint: ${step.hint}
                        </div>
                      `
                      : ''}
                    ${step.validators?.length
                      ? Html.wire(this, ':validators')`
                        <div class="quest-validators">
                          ${step.validators.map((v, i) => {
                            const result = validation?.[i];
                            const statusClass = result
                              ? result.passed
                                ? 'passed'
                                : 'failed'
                              : '';
                            const icon = result ? (result.passed ? '\u2713' : '\u2717') : '';
                            return Html.wire(v, ':validator')`
                              <div class="${'quest-validator ' + statusClass}">
                                <div class="quest-validator-icon">${icon}</div>
                                <span>${getValidatorLabel(v)}</span>
                              </div>
                            `;
                          })}
                        </div>
                      `
                      : ''}
                  </div>
                `
                : ''}

              ${validation && validation.some((r) => !r.passed)
                ? Html.wire(this, ':validation-hint')`
                  <div class="validation-hint">
                    ${validation
                      .filter((r) => !r.passed)
                      .map(
                        (r) =>
                          Html.wire(r, ':error')`
                          <div class="validation-error">${r.message}</div>
                        `
                      )}
                  </div>
                `
                : ''}

              <div class="quest-nav">
                <button
                  class="btn secondary"
                  disabled=${stepIndex === 0}
                  onclick=${() => this.handlePrev()}>
                  &lt; Prev
                </button>
                ${isChallenge
                  ? Html.wire(this, ':check-btn')`
                    <button class="btn primary" onclick=${() => this.handleCheck()}>
                      Check
                    </button>
                  `
                  : Html.wire(this, ':next-btn')`
                    <button class="btn primary" onclick=${() => this.handleNext()}>
                      ${isLastStep ? 'Complete' : 'Next >'}
                    </button>
                  `}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    /** Dispatch close event */
    handleClose() { this.element.dispatchEvent(new CustomEvent('close', { bubbles: true })); }
    /** Dispatch prev-step event */
    handlePrev() { this.element.dispatchEvent(new CustomEvent('prev-step', { bubbles: true })); }
    /** Dispatch next-step event */
    handleNext() { this.element.dispatchEvent(new CustomEvent('next-step', { bubbles: true })); }
    /** Dispatch check-step event for validation */
    handleCheck() { this.element.dispatchEvent(new CustomEvent('check-step', { bubbles: true })); }
    /**
     * Dispatch copy-code event
     * @param {string} code - Code to copy
     */
    handleCopy(code) { this.element.dispatchEvent(new CustomEvent('copy-code', { bubbles: true, detail: { code } })); }
    /**
     * Dispatch open-editor event
     * @param {string} code - Code to open in editor
     */
    handleOpenEditor(code) { this.element.dispatchEvent(new CustomEvent('open-editor', { bubbles: true, detail: { code } })); }
  }
);
