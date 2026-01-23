# Services

Backend services for the VS Code extension.

## Directory Structure

```
services/
├── files.md              # This file
├── ActionTracker.js      # Tracks user actions for badge unlocking
├── BadgeUnlockChecker.js # Checks conditions for unlocking badges
├── ProgressService.js    # Global progress tracking for badges, XP, and learning paths
└── QuestValidator.js     # Validates quest step completion
```

## Files

### `ActionTracker.js`

Tracks user actions (like generating types, opening files, etc.) to determine when badges should be unlocked. Implements the VS Code Disposable pattern.

### `BadgeUnlockChecker.js`

Checks whether badge unlock conditions are met based on tracked actions and current state. Works with ActionTracker to determine eligibility.

### `ProgressService.js`

Global progress tracking service using VS Code's globalState API. Manages XP/leveling, badge unlocks, quest progress, developer track selection, and recap bookmarks.

### `QuestValidator.js`

Validates quest step completion by checking code patterns, file existence, and other conditions specified in quest definitions.
