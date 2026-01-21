# vscode-api-ape

VSCode extension for api-ape IntelliSense support.

## Directory Structure

```
vscode-api-ape/
├── files.md       # This file
├── package.json   # Extension manifest
├── extension.png  # Extension icon
└── src/
    ├── extension.js   # Extension entry point
    ├── explorer.js    # API Explorer TreeView
    └── fileWatcher.js # Controller file watcher
```

## Files

### `package.json`

VSCode extension manifest. Defines:

- Extension metadata
- Activation events
- LSP client configuration
- Settings contribution

### `extension.png`

Extension icon displayed in the VSCode marketplace and sidebar.
