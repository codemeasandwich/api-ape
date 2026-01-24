# Tools Panel Components

This module contains hyper-element custom components for the API tools webview panel.

## Guidelines

- **hyper-element pattern** — Components extend `hyperElement` and use `customElements.define()`
- **Self-registering** — Each component file registers itself when loaded via script tag
- **VS Code messaging** — Components communicate with the extension via `postMessage`
- **Load order matters** — Dependencies must be loaded before components that use them

## Directory Structure

```
components/tools/
├── index.js               # Component loading documentation
├── ape-tab-bar.js         # Tab navigation bar
├── ape-endpoints-panel.js # Endpoint tree view with search
├── ape-config-panel.js    # Configuration settings display
├── ape-docs-panel.js      # Documentation and recaps view
├── ape-modal.js           # Recap modal dialog
└── ape-tools.js           # Root component coordinating all children
```

## Files

### `index.js`

Component loading documentation. In browser environments without bundlers, components are loaded via individual script tags in dependency order.

### `ape-tab-bar.js`

Tab navigation bar with Endpoints, Config, and Docs tabs. Emits `tab-change` event when user switches tabs. Maintains active tab state via `data-active` attribute.

### `ape-endpoints-panel.js`

Displays the API endpoint tree with search functionality. Shows endpoints grouped by namespace with expandable sections. Includes action buttons for testing and documentation. Contains `ape-endpoint-tree`, `ape-endpoint-group`, and `ape-endpoint-item` sub-components.

### `ape-config-panel.js`

Shows api-ape configuration settings including server URL, controller paths, and connection status. Includes toggles for auto-generate types and buttons for manual refresh/generate actions.

### `ape-docs-panel.js`

Documentation panel showing recent recaps and bookmarked items. Allows searching through documentation. Contains `ape-recap-list` and `ape-recap-item` sub-components.

### `ape-modal.js`

Recap modal dialog for viewing full documentation content. Shows modal backdrop with centered content. Contains `ape-modal-backdrop` and `ape-recap-modal` sub-components.

### `ape-tools.js`

Root component managing all tools panel state and coordination. Handles VS Code message passing, tab switching, and state synchronization. Renders child components based on active tab.
