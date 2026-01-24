/**
 * @fileoverview Root component for the Tools panel
 * Manages state and coordinates child components
 */

customElements.define(
  'ape-tools',
  class extends hyperElement {
    /**
     * Initialize component state and event handlers
     * @param {Function} attachStore - Store attachment function
     * @returns {Function} Cleanup function
     */
    setup(attachStore) {
      this.vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

      this.state = {
        activeTab: 'endpoints',
        endpoints: [],
        endpointsError: null,
        filterQuery: '',
        config: {
          serverUrl: 'localhost:3000',
          controllersPath: 'api/',
          connected: true,
          autoGenerate: true
        },
        recentRecaps: [],
        bookmarkedRecaps: [],
        modal: {
          open: false,
          recap: null
        }
      };

      this.onStoreChange = attachStore(() => this.state);

      this.messageHandler = (e) => this.handleMessage(e.data);
      window.addEventListener('message', this.messageHandler);

      // Event delegation for custom element events (hyper-element reserves on* for native elements)
      // In hyper-element setup(), 'this' is a wrapper object - use 'this.element' for DOM methods
      this.customEventHandler = (e) => this.handleCustomEvent(e);
      const customEvents = [
        'tab-change', 'filter-change', 'endpoint-click', 'endpoint-insert',
        'edit-server', 'refresh', 'generate', 'view-recap', 'bookmark-recap',
        'search-docs', 'close', 'copy-code'
      ];
      customEvents.forEach(event => this.element.addEventListener(event, this.customEventHandler));

      if (this.vscode) {
        this.vscode.postMessage({ command: 'ready' });
      }

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
      const type = e.type;
      switch (type) {
        case 'tab-change':
          this.switchTab(e.detail.tab);
          break;
        case 'filter-change':
          this.setFilter(e.detail.query);
          break;
        case 'endpoint-click':
          this.postMessage({ command: 'goToEndpoint', path: e.detail.path });
          break;
        case 'endpoint-insert':
          this.postMessage({ command: 'insertApiCall', path: e.detail.path });
          break;
        case 'edit-server':
          this.postMessage({ command: 'configureServer' });
          break;
        case 'refresh':
          this.postMessage({ command: 'refreshEndpoints' });
          break;
        case 'generate':
          this.postMessage({ command: 'generateTypes' });
          break;
        case 'view-recap':
          this.postMessage({ command: 'viewRecap', recapId: e.detail.recapId });
          break;
        case 'bookmark-recap':
          this.postMessage({ command: 'bookmarkRecap', recapId: e.detail.recapId });
          break;
        case 'search-docs':
          this.postMessage({ command: 'openDocs' });
          break;
        case 'close':
          this.closeModal();
          break;
        case 'copy-code':
          this.postMessage({ command: 'copyCode', code: e.detail.code });
          break;
      }
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
              recentRecaps: msg.state.recentRecaps || [],
              bookmarkedRecaps: msg.state.bookmarkedRecaps || [],
              config: msg.state.config || this.state.config
            });
            this.onStoreChange();
            // Request endpoints after state update
            if (this.vscode) {
              this.vscode.postMessage({ command: 'refreshEndpoints' });
            }
          }
          break;
        case 'updateEndpoints':
          this.state.endpoints = msg.endpoints || [];
          this.state.endpointsError = null;
          this.onStoreChange();
          break;
        case 'endpointsError':
          this.state.endpointsError = msg.error;
          this.onStoreChange();
          break;
        case 'showRecap':
          this.state.modal = { open: true, recap: msg.recap };
          this.onStoreChange();
          break;
        case 'updateBookmark':
          if (msg.isBookmarked) {
            if (!this.state.bookmarkedRecaps.includes(msg.recapId)) {
              this.state.bookmarkedRecaps = [...this.state.bookmarkedRecaps, msg.recapId];
            }
          } else {
            this.state.bookmarkedRecaps = this.state.bookmarkedRecaps.filter((id) => id !== msg.recapId);
          }
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
     * Switch to a different tab
     * @param {string} tab - Tab identifier
     */
    switchTab(tab) { this.state.activeTab = tab; this.onStoreChange(); }
    /**
     * Set filter query for endpoint search
     * @param {string} query - Filter query
     */
    setFilter(query) { this.state.filterQuery = query; this.onStoreChange(); }
    /** Close the recap modal */
    closeModal() { this.state.modal = { open: false, recap: null }; this.onStoreChange(); }
    /**
     * Render the tools panel
     * @param {Function} Html - hyperHTML tagged template function
     * @param {Object} state - Component state
     */
    render(Html, state) {
      Html`
        <div id="app">
          <ape-tab-bar
            data-active="${state.activeTab}">
          </ape-tab-bar>

          ${state.activeTab === 'endpoints'
            ? Html.wire(this, ':endpoints')`
              <ape-endpoints-panel
                data-endpoints='${JSON.stringify(state.endpoints)}'
                data-error="${state.endpointsError || ''}"
                data-filter="${state.filterQuery}">
              </ape-endpoints-panel>
            `
            : ''}

          ${state.activeTab === 'config'
            ? Html.wire(this, ':config')`
              <ape-config-panel
                data-config='${JSON.stringify(state.config)}'>
              </ape-config-panel>
            `
            : ''}

          ${state.activeTab === 'docs'
            ? Html.wire(this, ':docs')`
              <ape-docs-panel
                data-recaps='${JSON.stringify(state.recentRecaps)}'
                data-bookmarked='${JSON.stringify(state.bookmarkedRecaps)}'>
              </ape-docs-panel>
            `
            : ''}
        </div>

        ${state.modal.open
          ? Html.wire(this, ':modal')`
            <ape-modal-backdrop></ape-modal-backdrop>
            <ape-recap-modal
              data-recap='${JSON.stringify(state.modal.recap)}'>
            </ape-recap-modal>
          `
          : ''}
      `;
    }
  }
);
