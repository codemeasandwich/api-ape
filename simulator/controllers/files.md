# Controllers Module Files

This module provides an alternative directory for test controllers when specific test configurations require isolation from the main `test-api/` controllers.

## Guidelines

- **Use sparingly** — Prefer adding controllers to `test-api/` unless isolation is required
- **Document purpose** — Each controller here should explain why it can't be in `test-api/`
- **Match conventions** — Follow the same patterns as `test-api/` controllers

## Directory Structure

```
controllers/
└── (empty - add controllers here when test isolation is needed)
```

## Files

This directory is currently empty. Controllers are added here when:

1. Testing the `where` configuration option with different paths
2. Testing duplicate endpoint detection scenarios
3. Isolating controllers for specific edge case tests
