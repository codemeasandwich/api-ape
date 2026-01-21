# @api-ape/lsp

Language Server Protocol implementation for api-ape IntelliSense.

## Directory Structure

```
api-ape-lsp/
├── files.md       # This file
├── package.json   # Package configuration
└── src/
    ├── server.js        # LSP server entry point
    ├── analysis/
    │   └── analyzer.js  # Document analysis
    ├── providers/
    │   ├── completion.js  # Completion provider
    │   ├── definition.js  # Go-to-definition provider
    │   └── hover.js       # Hover provider
    └── schema/
        └── manager.js     # Schema fetching and caching
```

## Files

### `package.json`

Package configuration for @api-ape/lsp npm package.

### `src/server.js`

LSP server implementation. Handles:

- Connection initialization
- Document synchronization
- Request routing to providers

### `src/analysis/analyzer.js`

Document analysis for api-ape patterns.

- `analyzeDocument(document, schema)` - Generate diagnostics
- `extractApiCalls(text)` - Find api.x.y patterns
- `findApiChainAtPosition(document, position)` - Get chain at cursor
- `findSimilarEndpoints(path, endpoints)` - Suggest alternatives

### `src/providers/completion.js`

Completion provider for api-ape chains.

- `getCompletions(document, position, schema)` - Get completion items
- `resolveCompletion(item, schema)` - Add completion details

### `src/providers/definition.js`

Go-to-definition provider.

- `getDefinition(document, position, schema)` - Get definition location

### `src/providers/hover.js`

Hover information provider.

- `getHover(document, position, schema)` - Get hover content

### `src/schema/manager.js`

Schema fetching and caching.

- `SchemaManager` class for managing schema state
- Fetches from server or loads from local file
