/**
 * @fileoverview Modal components - backdrop and recap modal
 */

/**
 * Modal backdrop - click to close
 */
customElements.define(
  'ape-modal-backdrop',
  class extends hyperElement {
    /**
     * Render modal backdrop overlay
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) { Html`<div class="modal-backdrop" onclick=${() => this.handleClose()}></div>`; }
    /** Dispatch close event */
    handleClose() { this.element.dispatchEvent(new CustomEvent('close', { bubbles: true })); }
  }
);

/**
 * Recap modal - displays recap details
 */
customElements.define(
  'ape-recap-modal',
  class extends hyperElement {
    /**
     * Render recap modal with content
     * @param {Function} Html - hyperHTML tagged template function
     * @returns {void|*} Early return for empty recap
     */
    render(Html) {
      const recap = this.dataset.recap;

      if (!recap) {
        return Html`<div class="modal hidden"></div>`;
      }

      Html`
        <div class="modal">
          <div class="modal-header">
            <span>${recap.title}</span>
            <button class="modal-close" onclick=${() => this.handleClose()}>&times;</button>
          </div>
          <div class="modal-content">
            <div class="recap-summary">${recap.summary}</div>

            ${recap.methods?.length
              ? Html.wire(this, ':methods')`
                <div class="recap-methods">
                  ${recap.methods.map(
                    (m) =>
                      Html.wire(m, ':method')`
                    <div class="recap-method">
                      <span class="recap-method-name">${m.name}</span>
                      <span class="recap-method-desc">${m.description}</span>
                    </div>
                  `
                  )}
                </div>
              `
              : ''}

            ${recap.snippet
              ? Html.wire(this, ':snippet')`
                <div class="recap-snippet">
                  <pre>${recap.snippet}</pre>
                </div>
                <div style="margin-bottom:16px;">
                  <button class="btn secondary" onclick=${() => this.handleCopy(recap.snippet)}>
                    Copy
                  </button>
                </div>
              `
              : ''}

            ${recap.tips?.length
              ? Html.wire(this, ':tips')`
                <div class="recap-tips">
                  <div class="recap-tips-title">TIPS</div>
                  ${recap.tips.map(
                    (tip, i) =>
                      Html.wire({ tip, i }, ':tip')`
                    <div class="recap-tip">${tip}</div>
                  `
                  )}
                </div>
              `
              : ''}
          </div>
        </div>
      `;
    }

    /** Dispatch close event */
    handleClose() { this.element.dispatchEvent(new CustomEvent('close', { bubbles: true })); }
    /**
     * Dispatch copy-code event
     * @param {string} code - Code to copy
     */
    handleCopy(code) { this.element.dispatchEvent(new CustomEvent('copy-code', { bubbles: true, detail: { code } })); }
  }
);
