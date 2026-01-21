# vscode-api-ape

VSCode extension for api-ape IntelliSense support.

## Directory Structure

```
vscode-api-ape/
├── files.md       # This file
├── package.json   # Extension manifest
└── src/
    └── extension.js  # Extension entry point
```

## Files

### `package.json`

VSCode extension manifest. Defines:

- Extension metadata
- Activation events
- LSP client configuration
- Settings contribution

### `src/extension.js`

Extension activation and LSP client setup.

- `activate(context)` - Initialize LSP client
- `deactivate()` - Cleanup on extension deactivation
