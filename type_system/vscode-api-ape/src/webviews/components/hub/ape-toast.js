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
      const badge = this.dataset.badge ? JSON.parse(this.dataset.badge) : null;
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
      const badge = this.dataset.badge ? JSON.parse(this.dataset.badge) : {};
      const xpEarned = parseInt(this.dataset.xp, 10) || 0;
      const leveledUp = this.dataset.leveledUp === 'true';
      const newLevel = parseInt(this.dataset.newLevel, 10) || 0;

      Html`
        <div id="badge-unlock-toast" class="toast">
          <div class="toast-icon">${{ ToastIcon: Html.lite }}</div>
          <div class="toast-content">
            <div class="toast-title">Badge Unlocked!</div>
            <div class="toast-badge-name">${badge.name}</div>
            <div class="toast-xp">
              +${xpEarned} XP${leveledUp ? ` - Level ${newLevel}!` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }
);
