# Express Integration Tests

Verifies api-ape alongside a conventional Express app (custom `/health`, JSON REST routes).

## Directory Structure

```
express/
├── test.js                   # Executable harness spawning Express + shared scenarios
└── …                         # `node_modules` installed via npm (see package.json)
```

## Files

### `test.js`

Node.js script executed by `.hooks/pre-commit.d/check-integration.sh` when `integration/express/node_modules` exists. Boots Express middleware, attaches `ape`, runs `integration/shared/scenarios` through `runScenarios()`, and terminates with failing exit codes if websocket flows regress.
