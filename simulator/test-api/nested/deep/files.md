# Deep Nested Controllers Module Files

This module provides additional nesting levels for testing api-ape's path resolution at depth.

## Directory Structure

```
deep/
├── index.js      # Maps to 'nested/deep' endpoint
├── handler.js    # Maps to 'nested/deep/handler' endpoint
└── very/
    └── handler.js # Maps to 'nested/deep/very/handler' endpoint
```

## Files

### `index.js`

Maps to the `nested/deep` endpoint. Verifies index.js at 2 levels deep resolves correctly.

### `handler.js`

Maps to the `nested/deep/handler` endpoint. Verifies non-index files at depth.

### `very/`

Contains the deepest nesting level. See [`very/files.md`](./very/files.md).
