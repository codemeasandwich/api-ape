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
        return Html`<dialog class="modal hidden"></dialog>`;
      }

      Html`
        <dialog class="modal">
          <header class="modal-header">
            <span>${recap.title}</span>
            <button class="modal-close" onclick=${() => this.handleClose()}>&times;</button>
          </header>
          <section class="modal-content">
            <p class="recap-summary">${recap.summary}</p>

            ${recap.methods?.length
              ? Html.wire(this, ':methods')`
                <section class="recap-methods">
                  ${recap.methods.map(
                    (m) =>
                      Html.wire(m, ':method')`
                    <dl class="recap-method">
                      <dt class="recap-method-name">${m.name}</dt>
                      <dd class="recap-method-desc">${m.description}</dd>
                    </dl>
                  `
                  )}
                </section>
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
                <section class="recap-tips">
                  <h3 class="recap-tips-title">TIPS</h3>
                  <ul>
                    ${recap.tips.map(
                      (tip, i) =>
                        Html.wire({ tip, i }, ':tip')`
                      <li class="recap-tip">${tip}</li>
                    `
                    )}
                  </ul>
                </section>
              `
              : ''}
          </section>
        </dialog>
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
