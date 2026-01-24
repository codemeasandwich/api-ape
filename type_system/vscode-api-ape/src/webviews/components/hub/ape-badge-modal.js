/**
 * @fileoverview Badge collection modal with categorized badges
 */

/** Icon name mapping from badge icon to SVG file */
const iconMap = {
  wave: 'hand-heart',
  call: 'telephone',
  typescript: 'typescript',
  shield: 'shield-check',
  radio: 'radio',
  ear: 'volume-2',
  upload: 'arrow-big-up',
  plug: 'plug-connected',
  state: 'stack',
  'file-code': 'file-description',
  broadcast: 'satellite-dish',
  megaphone: 'party-popper',
  hook: 'link',
  context: 'layers',
  key: 'lock',
  'shield-check': 'shield-check',
  'shield-star': 'rosette-discount-check',
  castle: 'hotel',
  puzzle: 'sparkles',
  tree: 'rocket',
  server: 'router'
};

/**
 * Get icon file name from badge icon
 * @param {string} icon - Icon name
 * @returns {string} Icon file name (without extension)
 */
function getIconName(icon) {
  return iconMap[icon] || 'star';
}

customElements.define(
  'ape-badge-modal',
  class extends hyperElement {
    /**
     * Render badge collection modal with categorized badges
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const badges = this.attrs.badges || {};
      const categories = ['fundamentals', 'realtime', 'security', 'advanced'];

      Html`
        <dialog class="modal">
          <header class="modal-header">
            <span>BADGE COLLECTION</span>
            <button class="modal-close" onclick=${() => this.handleClose()}>&times;</button>
          </header>
          <section class="modal-content">
            ${categories.map((cat) => {
              const category = badges[cat];
              if (!category?.badges?.length) return '';
              const earned = category.badges.filter((b) => b.earned).length;
              return Html.wire(category, ':cat')`
                <section class="badge-category">
                  <h2 class="badge-category-title">
                    <span>${category.name.toUpperCase()}</span>
                    <span>${earned}/${category.badges.length}</span>
                  </h2>
                  <div class="badge-grid">
                    ${category.badges.map(
                      (badge) =>
                        Html.wire(badge, ':badge')`
                        <ape-badge-item
                          badge=${badge}
                          icon=${getIconName(badge.icon)}>
                        </ape-badge-item>
                      `
                    )}
                  </div>
                </section>
              `;
            })}
          </section>
        </dialog>
      `;
    }

    /** Dispatch close event to close the modal */
    handleClose() {
      this.element.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    }
  }
);

/**
 * Individual badge item with hover animation
 */
customElements.define(
  'ape-badge-item',
  class extends hyperElement {
    /**
     * Fragment for rendering badge SVG
     * @param {Function} lite - hyperHTML lite renderer
     * @returns {Object} Wire object with SVG html
     */
    BadgeSvg(lite) {
      const iconName = this.icon || 'star';
      // badgeSvgs is a global from badgeSvgs.js
      const svg = typeof badgeSvgs !== 'undefined' ? badgeSvgs[iconName] || badgeSvgs.star : '';
      return { html: svg, once: true };
    }

    /**
     * Render badge item with icon and name
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const badge = this.badge || {};
      const status = badge.earned ? 'earned' : badge.inProgress ? 'in-progress' : 'locked';

      Html`
        <div
          class="badge-item ${status}"
          title="${badge.description}"
          onclick=${() => this.handleClick()}>
          <div class="badge-icon">${{ BadgeSvg: Html.lite }}</div>
          <div class="badge-name">${badge.name}</div>
        </div>
      `;
    }

    /** Dispatch badge-click event for unearned badges */
    handleClick() {
      const badge = this.badge;
      if (badge && !badge.earned) {
        this.element.dispatchEvent(
          new CustomEvent('badge-click', {
            bubbles: true,
            detail: { badgeId: badge.id }
          })
        );
      }
    }
  }
);
