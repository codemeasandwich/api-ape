# End-to-End Stories Module Files

This module contains comprehensive test suites covering cross-feature scenarios and edge cases. These tests ensure api-ape works correctly in complex real-world situations.

## Guidelines

- **Edge case focus** — These tests target unusual but valid scenarios
- **Error path coverage** — Many tests verify error handling works correctly
- **Performance awareness** — High load tests should have reasonable limits
- **Cleanup always** — Edge case tests are more likely to leave dirty state

## Directory Structure

```
end-to-end/
├── index.test.js                        # Main test file
├── developer-async-operations/          # Async controller tests
├── developer-binary-data-variations/    # Binary data edge cases
├── developer-broadcast-edge-cases/      # Broadcast edge cases
├── developer-complex-data-types/        # JSS type tests
├── developer-connection-edge-cases/     # Connection edge cases
├── developer-connection-lifecycle/      # Lifecycle tests
├── developer-controller-return-values/  # Return value handling
├── developer-data-type-edge-cases/      # Data type edge cases
├── developer-error-handling/            # Error scenario tests
├── developer-error-recovery/            # Error recovery tests
├── developer-error-type-variations/     # Different error types
├── developer-file-sharing/              # File sharing tests
├── developer-file-sharing-variations/   # File sharing edge cases
├── developer-first-api-call/            # Initial connection tests
├── developer-high-load-scenarios/       # Stress tests
├── developer-jss-type-edge-cases/       # JSS edge cases
├── developer-multiple-server-instances/ # Multi-server tests
├── developer-nested-api-routes/         # Nested route tests
├── developer-real-time-chat/            # Chat scenario tests
└── developer-request-patterns/          # Request pattern tests
```

## Directories

Each directory contains individual test files for specific scenarios. The naming convention `developer-*` indicates tests from the developer's perspective using the public API.
