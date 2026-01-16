# Nested Controllers Module Files

This module provides deeply nested test controllers for testing api-ape's path resolution. The directory structure tests that `index.js` files correctly map to their parent paths.

## Guidelines

- **Path verification** — Controllers return their expected endpoint path for verification
- **Index convention** — `index.js` should map to parent directory name
- **Unique responses** — Each controller returns distinct data to verify correct routing

## Directory Structure

```
nested/
├── index.js          # Maps to 'nested' endpoint
└── deep/
    ├── index.js      # Maps to 'nested/deep' endpoint
    ├── handler.js    # Maps to 'nested/deep/handler' endpoint
    └── very/
        └── handler.js # Maps to 'nested/deep/very/handler' endpoint
```

## Files

### `index.js`

Maps to the `nested` endpoint. Returns identification data to verify routing.

### `deep/`

Subdirectory containing deeper nesting levels. See [`deep/files.md`](./deep/files.md).
