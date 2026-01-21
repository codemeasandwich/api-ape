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

### Signature Help

See parameter hints as you type endpoint calls:

```javascript
api.users.profile(|
//                ^
// api.users.profile({ userId: string, includeStats?: boolean }): Promise<UserProfile>
//
// Get user profile by ID
//
// **Parameters:**
// - userId (string): The user's unique identifier
// - includeStats (boolean, optional): Include usage statistics
```

Signature help is triggered automatically when you type `(` or `,` inside an endpoint call.

### Quick Fixes (Code Actions)

Get code actions for common issues:

- **Unknown endpoint** → Suggests similar endpoints, offers to replace with correct name
- **Deprecated endpoint** → One-click replacement with the modern alternative
- **Missing required parameters** → Auto-insert missing parameters with sensible defaults

```javascript
// Before: Unknown endpoint
api.users.profle({ userId: '123' })
//        ^^^^^^ Quick Fix: Replace with 'profile'

// After applying fix
api.users.profile({ userId: '123' })
```

```javascript
// Before: Missing required parameter
api.users.profile({})
//                ^^ Quick Fix: Add missing parameter 'userId'

// After applying fix
api.users.profile({ userId: "" })
```

### Diagnostics

Get real-time validation as you type:

#### Unknown Endpoint (Warning)

```javascript
api.users.nonExistent({ data: 'test' })
//        ^^^^^^^^^^^ Warning: Unknown endpoint '/users/nonExistent'.
//                    Did you mean '/users/profile'?
```

#### Deprecated Endpoint (Hint)

```javascript
api.users.legacyProfile({ id: '123' })
//        ^^^^^^^^^^^^^ Hint: Deprecated endpoint '/users/legacyProfile'.
//                      Use '/users/profile' instead.
```

Deprecated endpoints are shown with a strikethrough style in supported editors.

#### Missing Required Parameters (Warning)

```javascript
api.users.profile({})
//                ^^ Warning: Missing required parameter 'userId'
```

#### Unknown Parameters (Information)

```javascript
api.users.profile({ userId: '123', unknownParam: true })
//                                 ^^^^^^^^^^^^ Info: Unknown parameter 'unknownParam'
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
┌───────────────────────────────────────────────────────────────────────┐
│                           LSP Server                                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐    ┌───────────────────────────────────────────┐│
│  │  Schema Manager │◄───│ 1. HTTP: GET /api/ape/schema              ││
│  │                 │    │ 2. File: .api-ape/schema.json             ││
│  │  - Fetch/Cache  │◄───│ 3. Generate from local controllers        ││
│  │  - Status       │    └───────────────────────────────────────────┘│
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                 │
│  │    Analyzer     │◄─── Document Text                               │
│  │  - Parse AST    │                                                 │
│  │  - Validate     │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                         Providers                                │ │
│  │ ┌──────────┐ ┌──────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐ │ │
│  │ │Completion│ │Hover │ │Definition│ │Signature│ │  Code Action │ │ │
│  │ │          │ │      │ │          │ │  Help   │ │  (QuickFix)  │ │ │
│  │ └──────────┘ └──────┘ └──────────┘ └─────────┘ └──────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                        │
│                              ▼                                        │
│                    Diagnostics Engine                                 │
│            (Unknown, Deprecated, Missing Params)                      │
└───────────────────────────────────────────────────────────────────────┘
```

## Schema Sources

The LSP server can obtain endpoint schema from multiple sources:

### 1. Running Server (Preferred)

When an api-ape server is running, the LSP fetches schema from the schema endpoint:

```
GET http://localhost:3000/{controllersPath}/ape/schema
```

Where `{controllersPath}` is the configured controllers path (default: `api`).

**Advantages:**
- Always up-to-date
- Includes runtime information
- No manual regeneration needed

**Requirements:**
- Server must be running
- Schema endpoint must be accessible

### 2. Local Controllers (Auto-generation)

If the server is unavailable, the LSP can generate schema directly from local controller files:

```
api/
├── users/
│   ├── profile.js    (or .ts)
│   └── settings.js   (or .ts)
└── chat.js           (or .ts)
```

The schema extractor supports three methods for declaring types (in priority order):
1. **Named schema exports** - `module.exports.schema = { input, output }`
2. **TypeScript definitions** - Types from `.ts` files or companion `.d.ts` files
3. **JSDoc comments** - Traditional `@param` and `@returns` tags

**Advantages:**
- Works offline
- Supports TypeScript controllers
- Multiple type declaration options

**Requirements:**
- `@api-ape/schema` package
- `typescript` package (for TypeScript extraction)

### 3. Local File (Fallback)

If both the server and local generation fail, the LSP falls back to reading `.api-ape/schema.json`:

```
.api-ape/
└── schema.json
```

**Advantages:**
- Works offline
- Faster startup
- No dependencies

**Requirements:**
- Generated via `api-ape-types` CLI or `apiApe.generateTypes` command
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

  signatureHelpProvider: {
    triggerCharacters: ['(', ','],
    retriggerCharacters: [',']
  },

  codeActionProvider: {
    codeActionKinds: ['quickfix']
  },

  executeCommandProvider: {
    commands: ['apiApe.refreshSchema', 'apiApe.generateTypes', 'apiApe.getStatus']
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

Generate TypeScript declaration files from the schema:

```javascript
// VS Code
vscode.commands.executeCommand('apiApe.generateTypes');

// LSP request with optional output directory
const result = await connection.sendRequest('workspace/executeCommand', {
  command: 'apiApe.generateTypes',
  arguments: ['.api-ape']  // optional, defaults to '.api-ape'
});

// Result:
// {
//   success: true,
//   outputPath: '/path/to/project/.api-ape',
//   typesPath: '/path/to/project/.api-ape/api-ape.d.ts',
//   schemaPath: '/path/to/project/.api-ape/schema.json'
// }
```

This command:
1. Fetches the schema from the server (or generates from local controllers)
2. Generates TypeScript declarations for all endpoints
3. Writes `.api-ape/api-ape.d.ts` and `.api-ape/schema.json`

#### `apiApe.getStatus`

Get the current LSP connection status:

```javascript
// LSP request
const status = await connection.sendRequest('workspace/executeCommand', {
  command: 'apiApe.getStatus'
});

// Result:
// {
//   serverConnected: true,
//   schemaSource: 'server',  // 'server' | 'file' | 'generated' | 'none'
//   endpointCount: 42,
//   serverUrl: 'http://localhost:3000',
//   lastError: null,
//   cacheAge: 1234  // milliseconds since last schema fetch
// }
```

### Custom Requests

The server handles controller file change requests:

```javascript
// File changed
const result = await connection.sendRequest('apiApe/controllerChanged', {
  file: '/path/to/api/users/profile.js'
});
// Result: { success: true }

// File added
const result = await connection.sendRequest('apiApe/controllerAdded', {
  file: '/path/to/api/users/settings.js'
});
// Result: { success: true }

// File deleted
const result = await connection.sendRequest('apiApe/controllerDeleted', {
  file: '/path/to/api/users/deprecated.js'
});
// Result: { success: true }
```

These requests trigger a schema refresh and return a success status.

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
    ├── definition.js   # Go-to-definition provider
    ├── signature.js    # Signature help provider
    └── codeActions.js  # Quick fix code actions
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

### Signature help not appearing

1. Ensure cursor is inside parentheses of an endpoint call: `api.users.profile(|)`
2. Check that the endpoint exists in the schema
3. Verify the endpoint has input type information defined
4. Try typing a comma to re-trigger: `api.users.profile({ userId: '123',|)`

### Code actions / Quick fixes not available

1. Ensure there's a diagnostic (warning/hint) on the line
2. Click the lightbulb icon or use Ctrl+. (Cmd+. on Mac)
3. Check that the diagnostic is from `api-ape` source
4. For "replace endpoint" fixes, similar endpoints must exist in the schema

### Status shows 'none' for schema source

1. Server is not running and no fallback files exist
2. Check `apiApe.serverUrl` setting points to correct server
3. Generate a local schema: run `apiApe.generateTypes` command
4. Verify `.api-ape/schema.json` was created

## License

MIT
