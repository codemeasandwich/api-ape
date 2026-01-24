/**
 * @fileoverview Docs panel with recaps and bookmarks
 */

customElements.define(
  'ape-docs-panel',
  class extends hyperElement {
    /**
     * Render docs panel with recaps and bookmarks
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const recaps = this.recaps || [];
      const bookmarked = this.bookmarked || [];
      const bookmarkedRecaps = recaps.filter((r) => bookmarked.includes(r.id));

      Html`
        <section class="tool-panel active">
          <section class="docs-section">
            <h2 class="docs-label">RECENT RECAPS</h2>
            <ape-recap-list
              recaps=${recaps}
              bookmarked=${bookmarked}>
            </ape-recap-list>
          </section>
          <section class="docs-section">
            <h2 class="docs-label">BOOKMARKED</h2>
            <ape-recap-list
              recaps=${bookmarkedRecaps}
              bookmarked=${bookmarked}>
            </ape-recap-list>
          </section>
          <button class="btn secondary full-width" onclick=${() => this.handleSearchDocs()}>
            Search Docs...
          </button>
        </section>
      `;
    }

    /** Dispatch search-docs event */
    handleSearchDocs() { this.element.dispatchEvent(new CustomEvent('search-docs', { bubbles: true })); }
  }
);

/**
 * Recap list component
 */
customElements.define(
  'ape-recap-list',
  class extends hyperElement {
    /**
     * Render list of recap items
     * @param {Function} Html - hyperHTML tagged template function
     * @returns {void|*} Early return for empty list
     */
    render(Html) {
      const recaps = this.recaps || [];
      const bookmarked = this.bookmarked || [];

      if (!recaps.length) {
        return Html`
          <p class="text-muted" style="font-size:11px;padding:8px;">No recaps yet</p>
        `;
      }

      Html`
        <ul class="recap-list">
          ${recaps.map(
            (recap) =>
              Html.wire(recap, ':recap')`
              <ape-recap-item
                recap=${recap}
                bookmarked=${bookmarked.includes(recap.id)}>
              </ape-recap-item>
            `
          )}
        </ul>
      `;
    }
  }
);

/**
 * Individual recap item
 */
customElements.define(
  'ape-recap-item',
  class extends hyperElement {
    /**
     * Render recap item with bookmark toggle
     * @param {Function} Html - hyperHTML tagged template function
     */
    render(Html) {
      const recap = this.recap || {};
      const isBookmarked = this.bookmarked;

      Html`
        <li class="recap-item">
          <button class="recap-item-content" onclick=${(e) => this.handleClick(e)}>
            ${recap.title}
          </button>
          <button
            class="recap-bookmark${isBookmarked ? ' bookmarked' : ''}"
            data-action="bookmark"
            onclick=${(e) => this.handleClick(e)}>
            *
          </button>
        </li>
      `;
    }

    /**
     * Handle click - bookmark or view recap
     * @param {Event} e - Click event
     */
    handleClick(e) {
      const recapId = this.recap?.id;
      if (!recapId) return;

      if (e.target.dataset.action === 'bookmark') {
        this.element.dispatchEvent(
          new CustomEvent('bookmark-recap', {
            bubbles: true,
            detail: { recapId }
          })
        );
      } else {
        this.element.dispatchEvent(
          new CustomEvent('view-recap', {
            bubbles: true,
            detail: { recapId }
          })
        );
      }
    }
  }
);
