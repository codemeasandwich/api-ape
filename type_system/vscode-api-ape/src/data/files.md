# Data Files

JSON data files for the gamified learning hub.

## Directory Structure

```
data/
├── badges.json   # Badge definitions with XP rewards and unlock conditions
├── quests.json   # Quest definitions with steps and validators
└── recaps.json   # Documentation snippets for quick reference
```

## Files

### `badges.json`

Badge definitions with id, name, description, icon, track (client/server/both), category, XP reward, and unlock requirements.

### `quests.json`

Quest definitions with multi-step tutorials. Each quest has steps with content, code examples, and validators.

### `recaps.json`

Documentation snippets providing quick reference for api-ape concepts, methods, and patterns.
