# Services

Backend services for the VS Code extension.

## Directory Structure

```
services/
└── ProgressService.js  # Global progress tracking for badges, XP, and learning paths
```

## Files

### `ProgressService.js`

Global progress tracking service using VS Code's globalState API. Manages XP/leveling, badge unlocks, quest progress, developer track selection, and recap bookmarks.
