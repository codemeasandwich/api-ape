# Nested Controllers Module

## Overview

The nested module provides deeply nested test controllers for testing api-ape's path resolution. The directory structure tests that `index.js` files correctly map to their parent paths.

**Key capabilities:**

- **Index mapping** — Test `index.js` maps to parent directory name
- **Deep nesting** — Test 3-4 levels of nested directories
- **Handler files** — Test non-index files at various depths

These controllers verify the loader correctly resolves complex path structures.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Test API overview
- [`../../scenarios/stories/rpc/README.md`](../../scenarios/stories/rpc/README.md) — RPC stories including nested routes
