# VSCode Extension Source

Implementation for vscode-api-ape extension.

## Directory Structure

```
src/
├── files.md            # This file
├── commands.js         # Command registration
├── extension.js        # Extension entry point
├── extension-status.js # Status bar and health monitoring
├── explorer.js         # API Explorer TreeView
├── fileWatcher.js      # Controller file watcher
└── placeholders.js     # Placeholder UI components
```

## Files

### `commands.js`

Command registration for the VS Code extension.

- `registerCommands(context, getClient, updateStatusBar)` - Register all extension commands
- `triggerAutoGenerate(getClient, updateStatusBar, state)` - Debounced type generation

### `extension.js`

Extension activation and LSP client setup. Handles workspace detection, command registration, and status bar management.

- `activate(context)` - Initialize LSP client and register features
- `deactivate()` - Cleanup on extension deactivation

### `extension-status.js`

Status bar and health monitoring for api-ape extension.

- `createStatusBar(context)` - Create status bar item
- `updateStatusFromResult(result, statusBarItem)` - Update status bar from schema status
- `startHealthMonitoring(context, getClient, statusBarItem)` - Periodic health checks
- `checkSchemaFreshness(client, statusBarItem, log)` - Check if schema needs regeneration

### `explorer.js`

API Explorer TreeView provider for the sidebar panel.

- `EndpointTreeItem` - Tree item for endpoints and namespaces
- `EndpointTreeProvider` - TreeDataProvider implementation
- `registerExplorer(context, client)` - Register the explorer TreeView

### `fileWatcher.js`

Controller file watcher for automatic schema refresh.

- `setupFileWatcher(context, client, triggerAutoGenerate, getExplorerProvider)` - Watch for controller changes

### `placeholders.js`

Placeholder and fallback UI components when extension is not fully active.

- `registerPlaceholderExplorer(context, log)` - Show placeholder when not in api-ape workspace
- `registerFallbackExplorer(context, log)` - Show fallback when LSP fails to start
- `markCommandsRegistered()` - Mark commands as registered to prevent duplicates
