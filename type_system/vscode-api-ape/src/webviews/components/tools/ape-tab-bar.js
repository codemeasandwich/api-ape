/**
 * @fileoverview Tab bar component for switching between panels
 */

customElements.define(
  'ape-tab-bar',
  class extends hyperElement {
    /**
     * Render tab bar with tab buttons
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const active = this.dataset.active || 'endpoints';
      const tabs = [
        { id: 'endpoints', label: 'Endpoints' },
        { id: 'config', label: 'Config' },
        { id: 'docs', label: 'Docs' }
      ];

      Html`
        <div id="tools-tabs">
          ${tabs.map(
            (tab) =>
              Html.wire(tab, ':tab')`
              <button
                class="${'tool-tab' + (active === tab.id ? ' active' : '')}"
                onclick=${() => this.selectTab(tab.id)}>
                ${tab.label}
              </button>
            `
          )}
        </div>
      `;
    }

    /**
     * Dispatch tab-change event when tab is selected
     * @param {string} tabId - Selected tab identifier
     */
    selectTab(tabId) {
      this.element.dispatchEvent(
        new CustomEvent('tab-change', {
          bubbles: true,
          detail: { tab: tabId }
        })
      );
    }
  }
);
