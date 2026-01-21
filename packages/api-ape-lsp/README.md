# @api-ape/lsp

Language Server Protocol implementation for api-ape, providing IntelliSense features for api-ape's proxy-based API.

## Overview

This package implements the [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) to provide intelligent code assistance for api-ape projects. It powers the VS Code extension and can be used with any LSP-compatible editor.

## Features

### Completions

Get intelligent suggestions when typing `api.`:

```javascript
api.|
    // Suggestions:
    // ├── users     (Namespace: /users/...)
    // ├── chat      (Endpoint: /chat)
    // └── admin     (Namespace: /admin/...)

api.users.|
          // Suggestions:
          // ├── profile   (Endpoint: /users/profile)
          // ├── settings  (Endpoint: /users/settings)
          // └── ()        (Call /users directly)
```

### Hover Information

Hover over any api-ape call to see documentation:

```javascript
api.users.profile({ userId: '123' })
//        ^^^^^^^
// ### `/users/profile`
// Get user profile by ID
//
// **Input:**
// ```typescript
// { userId: string; includeStats?: boolean }
// ```
//
// **Returns:**
// ```typescript
// Promise<{ name: string; email: string; avatar?: string }>
// ```
//
// *Source: /path/to/api/users/profile.js:15*
```

### Go-to-Definition

Ctrl+Click (or Cmd+Click on Mac) on any endpoint to jump directly to the controller file:

```javascript
api.users.profile({ userId: '123' })
//        ^^^^^^^ Ctrl+Click → Opens /api/users/profile.js at line 15
```

### Diagnostics

Get warnings for invalid or unknown endpoints:

```javascript
api.users.nonExistent({ data: 'test' })
//        ^^^^^^^^^^^ Warning: Unknown endpoint '/users/nonExistent'.
//                    Did you mean '/users/profile'?
```

## Installation

```bash
npm install @api-ape/lsp
```

## Usage

### With VS Code Extension

The easiest way to use the LSP is through the official VS Code extension (`vscode-api-ape`), which bundles and manages the language server automatically.

### Standalone Usage

You can also run the language server directly:

```bash
node node_modules/@api-ape/lsp/src/server.js --stdio
```

### Integration with Other Editors

#### Neovim (with nvim-lspconfig)

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

configs.api_ape = {
  default_config = {
    cmd = { 'node', '/path/to/node_modules/@api-ape/lsp/src/server.js', '--stdio' },
    filetypes = { 'javascript', 'typescript', 'javascriptreact', 'typescriptreact' },
    root_dir = lspconfig.util.root_pattern('package.json'),
    settings = {
      apiApe = {
        serverUrl = 'http://localhost:3000',
        controllersPath = 'api',
      }
    }
  }
}

lspconfig.api_ape.setup{}
```

#### Sublime Text (with LSP package)

Add to `LSP.sublime-settings`:

```json
{
  "clients": {
    "api-ape": {
      "command": ["node", "/path/to/node_modules/@api-ape/lsp/src/server.js", "--stdio"],
      "selector": "source.js, source.ts",
      "settings": {
        "apiApe": {
          "serverUrl": "http://localhost:3000",
          "controllersPath": "api"
        }
      }
    }
  }
}
```

#### Emacs (with lsp-mode)

```elisp
(lsp-register-client
 (make-lsp-client
  :new-connection (lsp-stdio-connection '("node" "/path/to/node_modules/@api-ape/lsp/src/server.js" "--stdio"))
  :major-modes '(js-mode typescript-mode)
  :server-id 'api-ape-lsp))
```

## Configuration

The language server accepts the following settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `apiApe.serverUrl` | string | `"http://localhost:3000"` | URL of the api-ape server for schema introspection |
| `apiApe.controllersPath` | string | `"api"` | Path to the controllers directory |
| `apiApe.validateOnType` | boolean | `true` | Validate api-ape calls as you type |

### Configuration Example (VS Code)

```json
{
  "apiApe.serverUrl": "http://localhost:8080",
  "apiApe.controllersPath": "src/api",
  "apiApe.validateOnType": true
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LSP Server                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐│
│  │  Schema Manager │◄───│ HTTP: GET /api/ape/schema           ││
│  │                 │    │ or                                  ││
│  │  - Fetch        │◄───│ File: .api-ape/schema.json          ││
│  │  - Cache        │    └─────────────────────────────────────┘│
│  │  - Refresh      │                                           │
│  └────────┬────────┘                                           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────┐                                           │
│  │    Analyzer     │◄─── Document Text                         │
│  │                 │                                           │
│  │  - Parse AST    │                                           │
│  │  - Find chains  │                                           │
│  │  - Validate     │                                           │
│  └────────┬────────┘                                           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                      Providers                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │Completion│  │  Hover   │  │Definition│  │Diagnos- │ │  │
│  │  │ Provider │  │ Provider │  │ Provider │  │  tics   │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Schema Sources

The LSP server can obtain endpoint schema from two sources:

### 1. Running Server (Preferred)

When an api-ape server is running, the LSP fetches schema from the `/_schema` endpoint:

```
GET http://localhost:3000/api/ape/schema
```

**Advantages:**
- Always up-to-date
- Includes runtime information
- No manual regeneration needed

**Requirements:**
- Server must be running
- Schema endpoint must be accessible

### 2. Local File (Fallback)

If the server is unavailable, the LSP falls back to reading `.api-ape/schema.json`:

```
.api-ape/
└── schema.json
```

**Advantages:**
- Works offline
- Faster startup
- No server dependency

**Requirements:**
- Generated via `api-ape-types` CLI
- Must be regenerated when controllers change

## API

### Server Capabilities

The language server advertises these capabilities:

```javascript
{
  textDocumentSync: TextDocumentSyncKind.Incremental,

  completionProvider: {
    triggerCharacters: ['.'],
    resolveProvider: true
  },

  hoverProvider: true,

  definitionProvider: true,

  executeCommandProvider: {
    commands: ['apiApe.refreshSchema', 'apiApe.generateTypes']
  }
}
```

### Custom Commands

#### `apiApe.refreshSchema`

Force refresh the schema from the server:

```javascript
// VS Code
vscode.commands.executeCommand('apiApe.refreshSchema');

// LSP request
connection.sendRequest('workspace/executeCommand', {
  command: 'apiApe.refreshSchema'
});
```

#### `apiApe.generateTypes`

Generate TypeScript declarations (not yet implemented):

```javascript
vscode.commands.executeCommand('apiApe.generateTypes');
```

### Custom Notifications

The server listens for controller file change notifications:

```javascript
// File changed
connection.sendNotification('apiApe/controllerChanged', {
  file: '/path/to/api/users/profile.js'
});

// File added
connection.sendNotification('apiApe/controllerAdded', {
  file: '/path/to/api/users/settings.js'
});

// File deleted
connection.sendNotification('apiApe/controllerDeleted', {
  file: '/path/to/api/users/deprecated.js'
});
```

## Pattern Detection

The analyzer detects api-ape proxy chain patterns:

### Supported Patterns

```javascript
// Simple endpoint
api.users()
api.chat({ message: 'hello' })

// Nested endpoint
api.users.profile()
api.users.profile({ userId: '123' })

// Deep nesting
api.admin.users.permissions({ userId: '123' })

// With path parameters (not currently typed)
api.users('/123', { name: 'Alice' })
```

### Detection Regex

```javascript
/\bapi\.([a-zA-Z_][\w.]*?)(?:\s*\(|\s*$)/g
```

This matches:
- `api.` prefix (word boundary)
- One or more identifiers separated by `.`
- Followed by `(` or end of expression

## Completion Items

### Namespace Completion

When the current path is a prefix of multiple endpoints:

```javascript
{
  label: 'users',
  kind: CompletionItemKind.Module,
  detail: 'Namespace: /users/...',
  documentation: 'Access endpoints under /users'
}
```

### Endpoint Completion

When the path matches a specific endpoint:

```javascript
{
  label: 'profile',
  kind: CompletionItemKind.Method,
  detail: 'Endpoint: /users/profile',
  documentation: {
    kind: 'markdown',
    value: '**`/users/profile`** - Get user profile\n\n**Input:**\n```typescript\n{ userId: string }\n```'
  }
}
```

### Call Completion

When on an exact endpoint match:

```javascript
{
  label: '()',
  kind: CompletionItemKind.Method,
  detail: 'Call /users',
  insertText: '()'
}
```

## Diagnostics

### Unknown Endpoint

```javascript
{
  severity: DiagnosticSeverity.Warning,
  range: { start: { line: 5, character: 4 }, end: { line: 5, character: 15 } },
  message: "Unknown endpoint '/users/nonExistent'. Did you mean '/users/profile'?",
  source: 'api-ape'
}
```

### Similarity Matching

The LSP uses Levenshtein distance to suggest similar endpoints:

```javascript
// User types: api.user.profil()
// Suggestions: /users/profile (distance: 2)
```

Maximum edit distance for suggestions: 3

## File Structure

```
src/
├── server.js           # Main LSP entry point
├── schema/
│   └── manager.js      # Schema fetching and caching
├── analysis/
│   └── analyzer.js     # Document analysis and pattern detection
└── providers/
    ├── completion.js   # Completion provider
    ├── hover.js        # Hover provider
    └── definition.js   # Go-to-definition provider
```

## Dependencies

- `vscode-languageserver`: LSP server implementation
- `vscode-languageserver-textdocument`: Text document handling

## Development

### Running in Development

```bash
# Start with debugging
node --inspect src/server.js --stdio

# Or with VS Code debugger
# Use the "Attach to Language Server" configuration
```

### Testing

```bash
npm test
```

### Adding New Providers

1. Create provider in `src/providers/`
2. Register in `src/server.js`
3. Advertise capability in `onInitialize`

## Troubleshooting

### "Schema not available"

1. Check if server is running: `curl http://localhost:3000/api/ape/schema`
2. Check if `.api-ape/schema.json` exists
3. Run `api-ape-types` to generate schema

### Completions not showing

1. Ensure you're in a JavaScript/TypeScript file
2. Check that the pattern is `api.xxx` (must start with `api.`)
3. Verify schema has endpoints: check server response or schema.json

### Hover not working

1. Cursor must be on the property name, not `api` or parentheses
2. Endpoint must exist in schema
3. Try refreshing schema

### Go-to-definition opens wrong file

1. Ensure schema was generated from current controllers
2. Regenerate schema: `api-ape-types -c ./api`
3. Check that `filePath` in schema is absolute and correct

## License

MIT
