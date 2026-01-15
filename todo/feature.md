# Feature Request: Dev Mode Hot Reload for New Controllers

## Summary

Add a dev mode option that watches the controllers directory for new files and automatically registers them without requiring a server restart.

## Problem

When developing with api-ape, adding a new controller file (e.g., `api/finetune.js`) requires a full server restart to be picked up. This creates friction in the development workflow, especially when using tools like `tsx watch` or `nodemon` that only watch imported files.

### Current Behavior

1. `ape(server, { where: 'api' })` calls `loader('api')`
2. `deepRequire()` scans the directory once and caches all `.js` files
3. New files added after startup are never discovered
4. Developers must manually restart the server

### Expected Behavior (in dev mode)

New controller files added to the `api/` directory should be automatically discovered and registered.

## Proposed Solution

Enable file watching by default - no config flag needed. The watcher only fires on new file additions, which never happens in production (files are baked into the image/deployment). Zero performance cost in prod, seamless DX in dev.

### Implementation Sketch

```javascript
// In loader.js or main.js
const fs = require('fs');

// Initial load (existing behavior)
const controllers = deeprequire(path.join(currentDir, where));

// Watch for new files (zero dependencies - uses native fs.watch)
fs.watch(path.join(currentDir, where), { recursive: true }, (eventType, filename) => {
  if (eventType === 'rename' && filename?.endsWith('.js')) {
    const filePath = path.join(currentDir, where, filename);
    // Check if file exists (rename fires for both add and delete)
    if (fs.existsSync(filePath)) {
      const endpoint = pathToEndpoint(filename);
      if (!controllers[endpoint]) {
        controllers[endpoint] = require(filePath);
        console.log(`🦍 Hot-loaded controller: ${endpoint}`);
      }
    }
  }
});
```

No external dependencies - just Node's built-in `fs.watch()`.

### Why No Config Flag?

- **In production**: Files don't change. The watcher sits idle with zero overhead.
- **In development**: New controllers are picked up automatically. No restart needed, no config to remember.
- **Simpler API**: One less option to document and maintain.

## Environment

- api-ape version: 3.0.2
- Node.js version: 20.x
- Usage: Custom Next.js server with `tsx watch`

## Additional Context

This came up when using api-ape with a Next.js custom server in Docker. The development command is:

```bash
tsx watch server.ts
```

tsx watches TypeScript imports but doesn't know about api-ape's dynamic `require()` calls, so new controller files are invisible until restart.
