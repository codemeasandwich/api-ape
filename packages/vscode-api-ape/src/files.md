# VSCode Extension Source

Implementation for vscode-api-ape extension.

## Directory Structure

```
src/
├── files.md       # This file
├── extension.js   # Extension entry point
├── explorer.js    # API Explorer TreeView
└── fileWatcher.js # Controller file watcher
```

## Files

### `extension.js`

Extension activation and LSP client setup. Handles workspace detection, command registration, and status bar management.

- `activate(context)` - Initialize LSP client and register features
- `deactivate()` - Cleanup on extension deactivation

### `explorer.js`

API Explorer TreeView provider for the sidebar panel.

- `EndpointTreeItem` - Tree item for endpoints and namespaces
- `EndpointTreeProvider` - TreeDataProvider implementation
- `registerExplorer(context, client)` - Register the explorer TreeView

### `fileWatcher.js`

Controller file watcher for automatic schema refresh.

- `setupFileWatcher(context, client, triggerAutoGenerate, getExplorerProvider)` - Watch for controller changes
