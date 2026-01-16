# Scenarios Module Files

This module organizes all test scenarios into two complementary structures: atomic actions and complete user stories. This separation enables both reusable test primitives and comprehensive end-to-end test suites.

## Guidelines

- **Actions are atomic** — Each action file does one thing; combine actions in stories
- **Stories are complete** — Each story test should be independently runnable
- **Pass context explicitly** — Actions receive `{ harness, client, server, expect }` as parameters
- **Return useful values** — Actions should return results that stories can assert on
- **Document code paths** — Each story should note which api-ape code paths it exercises

## Directory Structure

```
scenarios/
├── actions/              # Atomic reusable test operations
│   ├── broadcast/        # Broadcast message operations
│   ├── cluster/          # Multi-server cluster operations
│   ├── connection/       # Connection lifecycle operations
│   ├── edge-cases/       # Edge case testing operations
│   ├── files/            # File transfer operations
│   ├── jss/              # JSS type testing operations
│   ├── lifecycle/        # Server lifecycle operations
│   └── rpc/              # RPC call operations
│
└── stories/              # Complete user journey test suites
    ├── broadcast/        # Broadcast functionality stories
    ├── chat-app/         # Chat application journey stories
    ├── cluster/          # Cluster/Forest functionality stories
    ├── end-to-end/       # Comprehensive end-to-end stories
    ├── file-sharing/     # File transfer stories
    ├── lifecycle/        # Connection lifecycle stories
    └── rpc/              # RPC functionality stories
```

## Directories

### `actions/`

Atomic test operations that perform single steps. Each action is a function that takes a context object and performs one operation. Actions are imported and composed by stories. See [`actions/files.md`](./actions/files.md).

### `stories/`

Complete test suites organized by feature area. Each story directory contains an `index.test.js` that imports test functions from subdirectories. Stories compose actions into realistic user journeys. See [`stories/files.md`](./stories/files.md).
