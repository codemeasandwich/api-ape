/**
 * @fileoverview Skills section with collapsible skill trees
 */

customElements.define(
  'ape-skills-section',
  class extends hyperElement {
    /**
     * Render the collapsible skills section
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const trees = this.dataset.trees ? JSON.parse(this.dataset.trees) : { client: [], server: [] };
      const expanded = this.dataset.expanded === 'true';

      Html`
        <section class="section">
          <button class="section-header" onclick=${() => this.handleToggle()}>
            SKILL TREES
            <span class="toggle-icon">${expanded ? 'v' : '>'}</span>
          </button>
          <div class="${'collapsible' + (expanded ? ' expanded' : '')}">
            <ape-skill-tree
              track=${'client'}
              nodes=${trees.client}>
            </ape-skill-tree>
            <ape-skill-tree
              track=${'server'}
              nodes=${trees.server}>
            </ape-skill-tree>
          </div>
        </section>
      `;
    }

    /** Dispatch toggle event to expand/collapse skill trees */
    handleToggle() {
      this.element.dispatchEvent(new CustomEvent('toggle', { bubbles: true }));
    }
  }
);

/**
 * Individual skill tree (client or server path)
 */
customElements.define(
  'ape-skill-tree',
  class extends hyperElement {
    /**
     * Render the skill tree nodes with connectors
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const track = this.track || '';
      const nodes = this.nodes || [];

      Html`
        <section class="skill-tree">
          <h3 class="skill-tree-label">${track.toUpperCase()} PATH:</h3>
          <ul class="skill-tree-nodes">
            ${nodes.map((node, index) => {
              const prevEarned = index > 0 && nodes[index - 1].earned;
              return Html.wire(node, ':node')`
                ${index > 0
                  ? Html.wire(node, ':conn')`
                    <li class="${'skill-connector' + (prevEarned ? ' earned' : '')}"></li>
                  `
                  : ''}
                <li>
                  <button
                    class="${'skill-node ' + (node.earned ? 'earned' : node.inProgress ? 'in-progress' : 'locked')}"
                    title="${node.id}"
                    onclick=${() => this.handleNodeClick(node)}>
                    ${node.label}
                  </button>
                </li>
              `;
            })}
          </ul>
        </section>
      `;
    }

    /**
     * Handle click on skill node - starts quest for unearned badges
     * @param {Object} node - Skill node with id, label, earned status
     */
    handleNodeClick(node) {
      if (!node.earned) {
        this.element.dispatchEvent(
          new CustomEvent('skill-click', {
            bubbles: true,
            detail: { nodeId: node.id }
          })
        );
      }
    }
  }
);
