# Schema Module

Schema management for the api-ape LSP server.

## Directory Structure

```
schema/
├── files.md           # This file
├── manager.js         # Schema manager
├── manager-fetch.js   # Server fetch utilities
└── manager-generate.js # Schema generation utilities
```

## Files

### `manager.js`

Schema manager for loading and caching endpoint schemas.

- `SchemaManager` class - Manages schema state and updates
- `getSchema()` - Get cached or fresh schema
- `refresh(options)` - Refresh cached schema
- `getEndpoint(path)` - Get endpoint by path

### `manager-fetch.js`

Server communication and schema fetching logic.

- `fetchFromServer(serverUrl, controllersPath, fetchTimeout)` - Single fetch attempt
- `fetchFromServerWithRetry(...)` - Fetch with retry logic

### `manager-generate.js`

Local file loading and schema generation from controllers.

- `getSchemaPackage()` - Lazily load @api-ape/schema
- `findProjectRoot(workspaceRoot, controllersPath, logger)` - Find project root
- `loadFromFile(workspaceRoot, logger)` - Load from .api-ape/schema.json
- `generateFromControllers(...)` - Generate schema from controllers
- `generateTypes(...)` - Generate TypeScript declarations
