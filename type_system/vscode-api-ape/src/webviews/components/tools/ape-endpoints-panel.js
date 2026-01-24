/**
 * @fileoverview Endpoints panel with search and tree view
 */

customElements.define(
  'ape-endpoints-panel',
  class extends hyperElement {
    /**
     * Render endpoints panel with search and tree
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const endpoints = this.endpoints || [];
      const error = this.error;
      const filter = this.filter || '';

      Html`
        <section class="tool-panel active">
          <div class="tool-search">
            <input
              type="text"
              placeholder="Search endpoints..."
              value="${filter}"
              oninput=${(e) => this.handleFilter(e.target.value)}>
          </div>
          <ape-endpoint-tree
            endpoints=${endpoints}
            error=${error || ''}
            filter=${filter}>
          </ape-endpoint-tree>
        </section>
      `;
    }

    /**
     * Dispatch filter-change event when search input changes
     * @param {string} query - Filter query
     */
    handleFilter(query) {
      this.element.dispatchEvent(new CustomEvent('filter-change', { bubbles: true, detail: { query } }));
    }
  }
);

/**
 * Endpoint tree component - groups endpoints by namespace
 */
customElements.define(
  'ape-endpoint-tree',
  class extends hyperElement {
    /**
     * Initialize collapsed state tracking
     * @param {Function} attachStore - Store attachment function
     * @returns {Object} Initial state
     */
    setup(attachStore) {
      // Track collapsed state locally
      this.collapsed = {};
      this.onStoreChange = attachStore(() => ({ collapsed: this.collapsed }));
    }

    /**
     * Render endpoint tree with grouped namespaces
     * @param {Function} Html - hyperHTML tagged template function
     * @returns {void|*} Early return for error/empty state
     */
    render(Html) {
      const endpoints = this.endpoints || [];
      const error = this.error;
      const filter = (this.filter || '').toLowerCase();

      if (error) {
        return Html`
          <div class="endpoints-tree">
            <div class="text-muted" style="font-size:11px;padding:8px;color:var(--error-color);">
              ${error}
            </div>
          </div>
        `;
      }

      if (!endpoints.length) {
        return Html`
          <div class="endpoints-tree">
            <div class="text-muted" style="font-size:11px;padding:8px;">No endpoints found</div>
          </div>
        `;
      }

      // Group endpoints by namespace
      const grouped = {};
      endpoints.forEach((ep) => {
        const ns = ep.path.split('.').slice(0, -1).join('.') || 'root';
        if (!grouped[ns]) grouped[ns] = [];
        grouped[ns].push(ep);
      });

      // Filter endpoints
      const filteredGroups = Object.entries(grouped)
        .map(([ns, eps]) => ({
          ns,
          endpoints: filter ? eps.filter((ep) => ep.path.toLowerCase().includes(filter)) : eps
        }))
        .filter((g) => g.endpoints.length > 0);

      Html`
        <div class="endpoints-tree">
          ${filteredGroups.map(
            (group) =>
              Html.wire(group, ':group')`
              <ape-endpoint-group
                namespace=${group.ns}
                endpoints=${group.endpoints}
                collapsed=${this.collapsed[group.ns] || false}
                ontoggle=${(e) => this.toggleGroup(e.detail.namespace)}>
              </ape-endpoint-group>
            `
          )}
        </div>
      `;
    }

    /**
     * Toggle collapsed state for a namespace group
     * @param {string} namespace - Namespace to toggle
     */
    toggleGroup(namespace) { this.collapsed[namespace] = !this.collapsed[namespace]; this.onStoreChange(); }
  }
);

/**
 * Endpoint group - collapsible namespace section
 */
customElements.define(
  'ape-endpoint-group',
  class extends hyperElement {
    /**
     * Render collapsible endpoint group
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const ns = this.namespace;
      const endpoints = this.endpoints || [];
      const collapsed = this.collapsed;

      Html`
        <details class="endpoint-group" open=${!collapsed}>
          <summary
            class="endpoint-group-header"
            onclick=${(e) => { e.preventDefault(); this.handleToggle(); }}>
            <span class="icon">${collapsed ? '>' : 'v'}</span>
            <span>${ns} (${endpoints.length})</span>
          </summary>
          <div class="endpoint-group-items">
            ${endpoints.map(
              (ep) =>
                Html.wire(ep, ':item')`
                <ape-endpoint-item
                  path=${ep.path}
                  returnType=${ep.returnType || 'void'}
                  onclick=${() => this.handleClick(ep.path)}
                  ondblclick=${() => this.handleInsert(ep.path)}>
                </ape-endpoint-item>
              `
            )}
          </div>
        </details>
      `;
    }

    /** Dispatch toggle event for this namespace */
    handleToggle() { this.element.dispatchEvent(new CustomEvent('toggle', { bubbles: true, detail: { namespace: this.namespace } })); }
    /**
     * Dispatch endpoint-click event
     * @param {string} path - Endpoint path
     */
    handleClick(path) { this.element.dispatchEvent(new CustomEvent('endpoint-click', { bubbles: true, detail: { path } })); }
    /**
     * Dispatch endpoint-insert event
     * @param {string} path - Endpoint path
     */
    handleInsert(path) { this.element.dispatchEvent(new CustomEvent('endpoint-insert', { bubbles: true, detail: { path } })); }
  }
);

/**
 * Individual endpoint item
 */
customElements.define(
  'ape-endpoint-item',
  class extends hyperElement {
    /**
     * Render endpoint item with name and return type
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const path = this.path;
      const returnType = this.returnType || 'void';
      const name = path.split('.').pop();

      Html`
        <button class="endpoint-item" data-path="${path}">
          <span class="endpoint-name">${name}</span>
          <span class="endpoint-type">->${returnType}</span>
        </button>
      `;
    }
  }
);
