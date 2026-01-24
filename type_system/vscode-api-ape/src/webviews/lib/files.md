# Webview Libraries

This module contains third-party libraries and utilities for VS Code webview components.

## Guidelines

- **Vendor files** — `.min.js` files are third-party libraries; do not modify
- **No bundler** — Libraries are loaded via script tags in VS Code webviews
- **Global scope** — Libraries expose globals (`hyperHTML`, `hyperElement`, `hyperUtils`)

## Directory Structure

```
lib/
├── hyperhtml.min.js      # hyperHTML library for reactive DOM updates
├── hyper-element.min.js  # Custom element base class using hyperHTML
└── hyper-utils.js        # VS Code bridge utilities for hyper-element
```

## Files

### `hyperhtml.min.js`

Third-party hyperHTML library (v2.x) providing lightweight reactive DOM updates via tagged template literals. Creates efficient DOM diffing without a virtual DOM. Exposes `hyperHTML` global.

### `hyper-element.min.js`

Third-party hyper-element library providing a custom element base class that integrates with hyperHTML. Components extend `hyperElement` and implement `setup()` and `render()` methods. Exposes `hyperElement` global.

### `hyper-utils.js`

Custom utilities for VS Code webview integration:
- `createVsCodeBridge()` — Bridges hyper-element state with VS Code postMessage API
- `escapeHtml()` — HTML entity escaping utility
- `debounce()` — Function debouncing for search inputs
- `groupBy()` — Array grouping utility for organizing endpoints

Exposes `hyperUtils` global.
