/**
 * @fileoverview Tools panel components
 * This file should be loaded after hyperhtml and hyper-element
 */

// Note: In a browser environment without a bundler, these would be loaded via script tags
// The component files self-register their custom elements via customElements.define()

// Component loading order matters - load dependencies first:
// 1. ape-tab-bar.js       - No dependencies
// 2. ape-endpoints-panel.js - Contains ape-endpoint-tree, ape-endpoint-group, ape-endpoint-item
// 3. ape-config-panel.js  - No dependencies
// 4. ape-docs-panel.js    - Contains ape-recap-list, ape-recap-item
// 5. ape-modal.js         - Contains ape-modal-backdrop, ape-recap-modal
// 6. ape-tools.js         - Root component, depends on all above

// When bundled, this file can export all components
// For now, each file self-registers when loaded

console.log('[ape-tools] Components loaded');
