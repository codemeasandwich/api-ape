# Webview Libraries

This module contains third-party libraries and utilities for VS Code webview components.

## Guidelines

- **Vendor files** — `.min.js` files are third-party libraries; do not modify
- **No bundler** — Libraries are loaded via script tags in VS Code webviews
- **Global scope** — Libraries expose globals (`hyperHTML`, `hyperElement`, `hyperUtils`)

## Directory Structure

```
lib/
├── hyperElement.min.js   # Combined hyperHTML + hyper-element bundle (fetched at build time)
└── hyper-utils.js        # VS Code bridge utilities for hyper-element
```

## Files

### `hyperElement.min.js`

Combined bundle fetched from jsDelivr CDN at build time via `npm run fetch:hyper-element`. Includes:
- hyperHTML library for reactive DOM updates via tagged template literals
- hyper-element custom element base class

Components extend `hyperElement` and implement `setup()` and `render()` methods. Exposes `hyperHTML` and `hyperElement` globals.

**Note:** This file is not committed to source control. It is downloaded during `npm install` (via prepare script) or `vsce package` (via prepublish script).

### `hyper-utils.js`

Custom utilities for VS Code webview integration:
- `createVsCodeBridge()` — Bridges hyper-element state with VS Code postMessage API
- `escapeHtml()` — HTML entity escaping utility
- `debounce()` — Function debouncing for search inputs
- `groupBy()` — Array grouping utility for organizing endpoints

Exposes `hyperUtils` global.
