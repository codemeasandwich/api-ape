/**
 * @fileoverview Config panel component
 */

customElements.define(
  'ape-config-panel',
  class extends hyperElement {
    /**
     * Render config panel with settings
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const config = this.dataset.config || {
        serverUrl: 'localhost:3000',
        controllersPath: 'api/',
        connected: true,
        autoGenerate: true
      };

      Html`
        <div class="tool-panel active">
          <div class="config-row">
            <label>Server:</label>
            <span>${config.serverUrl}</span>
            <button class="btn-icon" onclick=${() => this.handleEditServer()}>E</button>
          </div>
          <div class="config-row">
            <label>Controllers:</label>
            <span>${config.controllersPath}</span>
          </div>
          <div class="config-row">
            <label>Status:</label>
            <span class="${'status-dot ' + (config.connected ? 'connected' : 'disconnected')}"></span>
            <span>${config.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="config-checkbox">
            <input type="checkbox" id="config-autogen" checked=${config.autoGenerate}>
            <label for="config-autogen">Auto-generate types</label>
          </div>
          <div class="config-actions">
            <button class="btn secondary" onclick=${() => this.handleRefresh()}>Refresh</button>
            <button class="btn secondary" onclick=${() => this.handleGenerate()}>Generate Types</button>
          </div>
        </div>
      `;
    }

    /** Dispatch edit-server event */
    handleEditServer() { this.element.dispatchEvent(new CustomEvent('edit-server', { bubbles: true })); }
    /** Dispatch refresh event */
    handleRefresh() { this.element.dispatchEvent(new CustomEvent('refresh', { bubbles: true })); }
    /** Dispatch generate event */
    handleGenerate() { this.element.dispatchEvent(new CustomEvent('generate', { bubbles: true })); }
  }
);
