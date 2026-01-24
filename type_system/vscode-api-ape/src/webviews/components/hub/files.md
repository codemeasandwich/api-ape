# Hub Panel Components

This module contains hyper-element custom components for the gamified learning hub webview panel.

## Guidelines

- **hyper-element pattern** — Components extend `hyperElement` and use `customElements.define()`
- **Self-registering** — Each component file registers itself when loaded via script tag
- **VS Code messaging** — Components communicate with the extension via `postMessage`
- **Load order matters** — Dependencies must be loaded before components that use them

## Directory Structure

```
components/hub/
├── index.js              # Component loading documentation
├── ape-level-card.js     # User level display with XP bar and track badges
├── ape-quest-section.js  # Current quest display with progress
├── ape-skills-section.js # Skill tree visualization
├── ape-modal-backdrop.js # Semi-transparent modal overlay
├── ape-badge-modal.js    # Badge collection modal
├── ape-quest-modal.js    # Quest detail modal with step navigation
├── ape-toast.js          # Badge unlock toast notification
└── ape-hub.js            # Root component coordinating all children
```

## Files

### `index.js`

Component loading documentation. In browser environments without bundlers, components are loaded via individual script tags in dependency order.

### `ape-level-card.js`

Displays the user's current level, XP progress bar, and track badges (Client/Server). Receives data via `data-summary` attribute containing JSON-serialized progress summary.

### `ape-quest-section.js`

Shows the active quest with title, description, and progress bar. Includes "Continue" and "Skip" buttons. When no quest is active, shows a "Suggest Quest" button. Contains `ape-quest-card` and `ape-no-quest-card` sub-components.

### `ape-skills-section.js`

Visualizes the skill tree for both Client and Server paths. Shows earned/in-progress badges as connected nodes. Collapsible section with toggle animation. Contains `ape-skill-tree` sub-component.

### `ape-modal-backdrop.js`

Semi-transparent overlay for modal dialogs. Emits `close` event when clicked.

### `ape-badge-modal.js`

Displays the badge collection organized by category (Fundamentals, Real-time, Security, Advanced). Shows earned status and XP values. Allows starting quests for unearned badges. Requires `badgeSvgs` global for badge icons. Contains `ape-badge-item` sub-component.

### `ape-quest-modal.js`

Quest detail view with step-by-step navigation. Shows code examples, explanations, and validation results. Includes Previous/Next/Check buttons for step progression. Emits events for step completion and code copying.

### `ape-toast.js`

Toast notification for badge unlock celebrations. Shows badge icon, name, XP earned, and level-up indicator. Auto-dismisses after 4 seconds. Requires `badgeSvgs` global.

### `ape-hub.js`

Root component managing all hub panel state and coordination. Handles VS Code message passing, event delegation from child components, and state synchronization. Renders child components with appropriate data attributes.
