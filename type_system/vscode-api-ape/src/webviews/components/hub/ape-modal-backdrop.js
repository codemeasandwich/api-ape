/**
 * @fileoverview Modal backdrop component - click to close modals
 */

customElements.define(
  'ape-modal-backdrop',
  class extends hyperElement {
    /**
     * Render the semi-transparent backdrop overlay
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      Html`
        <div id="modal-backdrop" onclick=${() => this.handleClose()}></div>
      `;
    }

    /** Dispatch close event when backdrop is clicked */
    handleClose() {
      this.element.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    }
  }
);
