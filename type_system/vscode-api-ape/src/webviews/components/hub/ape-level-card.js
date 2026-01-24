/**
 * @fileoverview Level card component showing XP, level, and track progress
 */

customElements.define(
  'ape-level-card',
  class extends hyperElement {
    /**
     * Render the level card with XP bar and track badges
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const summary = this.dataset.summary ? JSON.parse(this.dataset.summary) : {};
      const xpTotal = summary.xp + (summary.levelProgress?.required - summary.levelProgress?.current);

      Html`
        <section class="section">
          <article class="level-card" onclick=${() => this.handleClick()}>
            <h2 class="level-title">LEVEL ${summary.level}: ${summary.levelTitle}</h2>
            <div class="xp-bar">
              <div class="xp-fill" style="width: ${summary.levelProgress?.percentage || 0}%"></div>
            </div>
            <div class="xp-text">${summary.xp} / ${xpTotal} XP</div>
            <div class="track-badges">
              <button
                class="${'track-badge' + (summary.track === 'client' ? ' selected' : '')}"
                onclick=${(e) => this.selectTrack(e, 'client')}>
                <span class="track-icon">CL</span>
                <span class="track-pct">${summary.clientProgress}%</span>
              </button>
              <button
                class="${'track-badge' + (summary.track === 'server' ? ' selected' : '')}"
                onclick=${(e) => this.selectTrack(e, 'server')}>
                <span class="track-icon">SV</span>
                <span class="track-pct">${summary.serverProgress}%</span>
              </button>
            </div>
          </article>
        </section>
      `;
    }

    /** Dispatch view-badges event when card is clicked */
    handleClick() {
      this.element.dispatchEvent(new CustomEvent('view-badges', { bubbles: true }));
    }

    /**
     * Dispatch track-select event for track badge clicks
     * @param {Event} e - Click event
     * @param {string} track - Track identifier ('client' or 'server')
     */
    selectTrack(e, track) {
      e.stopPropagation();
      this.element.dispatchEvent(
        new CustomEvent('track-select', {
          bubbles: true,
          detail: { track }
        })
      );
    }
  }
);
