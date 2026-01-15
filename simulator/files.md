# Simulator Module Files

This module provides a comprehensive end-to-end testing system for api-ape, designed to achieve 100% code coverage through real-world user scenarios. All tests interact with api-ape exactly as a developer would via the public API.

## Guidelines

- **Interface-only testing** — Never import internal modules; all tests use only `ape()`, `api.*`, `broadcast()`, and public exports
- **User story driven** — Each test module represents an atomic action in a real user workflow
- **Instant execution** — Use short timeouts (500ms connections, 1000ms requests) since everything runs locally
- **Harness isolation** — Each test gets a fresh `Harness` instance; always call `harness.cleanup()` in `afterEach`
- **Controller simplicity** — Test controllers in `test-api/` should be minimal; they exist only to exercise framework features

## Directory Structure

```
simulator/
├── README.md             # Overview, architecture diagrams, usage examples
├── harness/              # Core test infrastructure (managers, fake browser/db)
├── controllers/          # Alternative controller directory (if used)
├── scenarios/            # Test scenarios organized by type
│   ├── actions/          # Atomic reusable test operations
│   └── stories/          # Complete user journey test suites
└── test-api/             # Test controllers loaded by api-ape server
```

## Files

### `README.md`

Comprehensive documentation covering:
- Core testing principles and benefits
- Test harness architecture with ASCII diagrams
- Usage examples for createPair, createGroup, createCluster
- Module specifications for all test categories
- Complete user scenario examples

### `harness/`

Core test infrastructure providing server/client lifecycle management, browser simulation, and fake database adapters. See [`harness/files.md`](./harness/files.md).

### `controllers/`

Alternative controller directory for specific test configurations. See [`controllers/files.md`](./controllers/files.md) if present.

### `scenarios/`

Test scenarios organized into atomic actions and complete user stories. See [`scenarios/files.md`](./scenarios/files.md).

### `test-api/`

Test controllers that api-ape loads during testing. Simple implementations that exercise specific framework features. See [`test-api/files.md`](./test-api/files.md).
