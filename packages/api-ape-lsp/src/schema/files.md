# Schema Module

Schema management for the api-ape LSP server.

## Directory Structure

```
schema/
├── files.md    # This file
└── manager.js  # Schema manager
```

## Files

### `manager.js`

Schema manager for loading and caching endpoint schemas.

- `SchemaManager` class - Manages schema state and updates
- `loadSchema()` - Load schema from server or file
- `refreshSchema()` - Refresh cached schema
- `getEndpoint(path)` - Get endpoint by path
