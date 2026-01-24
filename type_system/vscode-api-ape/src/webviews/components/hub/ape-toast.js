/**
 * @fileoverview Badge unlock toast notification
 */

/** Icon name mapping (shared with badge modal) */
const toastIconMap = {
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

customElements.define(
  'ape-badge-toast',
  class extends hyperElement {
    /**
     * Fragment for rendering badge SVG in toast
     * @param {Function} lite - hyperHTML lite renderer
     * @returns {Object} Wire object with SVG html
     */
    ToastIcon(lite) {
      const badge = this.badge || null;
      const iconName = toastIconMap[badge?.icon] || 'star';
      // badgeSvgs is a global from badgeSvgs.js
      const svg = typeof badgeSvgs !== 'undefined' ? badgeSvgs[iconName] || badgeSvgs.star : '';
      return { html: svg, once: true };
    }

    /**
     * Render the toast notification with badge info
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      Html`
        <output class="toast">
          <div class="toast-icon">${{ ToastIcon: Html.lite }}</div>
          <div class="toast-content">
            <strong class="toast-title">Badge Unlocked!</strong>
            <p class="toast-badge-name">${this.badge.name}</p>
            <p class="toast-xp">
              +${this.xp} XP${this.leveledUp ? ` - Level ${this.newLevel}!` : ''}
            </p>
          </div>
        </output>
      `;
    }
  }
);
