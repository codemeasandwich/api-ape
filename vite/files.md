# Vite Plugin Files

This module provides a Vite plugin that integrates api-ape directly into Vite's dev server, eliminating the need for a separate backend process and proxy configuration.

## Guidelines

- **Dev mode only** — The plugin only runs during development (`apply: 'serve'`)
- **Lazy loading** — The api-ape server module is loaded at runtime, not during config bundling
- **SSR module loading** — Uses Vite's `ssrLoadModule` for TypeScript support in onConnect handlers
- **Dual format** — Exports both ESM (.mjs) and CommonJS (.js) for maximum compatibility
- **Forwarded options** — Any `ape(server, options)` field not handled by the plugin (for example `logging: false` to silence internal framework logs on the dev server) is passed through via `...rest` to `server/lib/main`

## Directory Structure

```
vite/
├── index.js   # CommonJS entry point
└── index.mjs  # ESM entry point
```

## Files

### `index.js`

CommonJS entry point for the Vite plugin. Creates a plugin that:
- Waits for Vite's HTTP server to start listening
- Loads and initializes api-ape on the underlying HTTP server
- Supports onConnect as either a function or a path to a module (TypeScript supported)

### `index.mjs`

ESM entry point for the Vite plugin. Same functionality as `index.js` but uses ES module syntax. This is the primary entry point for modern Vite configs using `import` syntax.
