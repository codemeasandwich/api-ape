# LSP Source

Language Server Protocol implementation source code.

## Directory Structure

```
src/
├── files.md          # This file
├── server.js         # LSP server entry point
├── server-handlers.js # Request handlers
├── analysis/         # Document analysis module
├── providers/        # LSP feature providers
├── schema/           # Schema management
└── utils/            # Shared utilities
```

## Files

### `server.js`

LSP server entry point. Initializes the language server, registers providers, handles document synchronization, and manages schema state.

- Creates LSP connection
- Registers completion, hover, definition, signature, and code action providers
- Handles workspace/executeCommand requests
- Manages document change notifications

### `server-handlers.js`

Request handlers for the api-ape LSP server.

- `registerControllerHandlers(connection, schemaManager)` - Controller file change handlers
- `registerCommandHandler(connection, schemaManager)` - Execute command handler
