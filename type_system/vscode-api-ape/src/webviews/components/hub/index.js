/**
 * @fileoverview Hub panel components
 * This file should be loaded after hyperhtml, hyper-element, and badgeSvgs
 */

// Note: In a browser environment without a bundler, these would be loaded via script tags
// The component files self-register their custom elements via customElements.define()

// Component loading order matters - load dependencies first:
// 1. ape-level-card.js     - No dependencies
// 2. ape-quest-section.js  - Contains ape-quest-card, ape-no-quest-card
// 3. ape-skills-section.js - Contains ape-skill-tree
// 4. ape-modal-backdrop.js - No dependencies
// 5. ape-badge-modal.js    - Contains ape-badge-item (requires badgeSvgs global)
// 6. ape-quest-modal.js    - No dependencies
// 7. ape-toast.js          - Requires badgeSvgs global
// 8. ape-hub.js            - Root component, depends on all above

// When bundled, this file can export all components
// For now, each file self-registers when loaded

console.log('[ape-hub] Components loaded');
