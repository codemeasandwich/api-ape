# LSP Providers

Language Server Protocol feature providers for api-ape IntelliSense.

## Directory Structure

```
providers/
├── files.md        # This file
├── codeActions.js  # Quick fix and refactoring actions
├── completion.js   # Auto-completion
├── definition.js   # Go to definition
├── hover.js        # Hover information
└── signature.js    # Signature help
```

## Files

### `codeActions.js`

Code action provider for quick fixes and refactoring.

- `provideCodeActions(document, range, context, schema)` - Provide code actions for diagnostics

### `completion.js`

Completion provider for endpoint and parameter suggestions.

- `provideCompletions(document, position, schema)` - Provide completion items

### `definition.js`

Definition provider for go-to-definition on endpoints.

- `provideDefinition(document, position, schema)` - Find definition location

### `hover.js`

Hover provider for endpoint documentation.

- `provideHover(document, position, schema)` - Provide hover information

### `signature.js`

Signature help provider for function parameters.

- `provideSignatureHelp(document, position, schema)` - Provide signature information
