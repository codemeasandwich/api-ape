# Controllers Module

## Overview

The controllers module provides an alternative directory for test controllers when specific test configurations require isolation from the main `test-api/` controllers.

**Key capabilities:**

- **Test isolation** — Separate controller sets for specific test scenarios
- **Configuration testing** — Test different `where` path configurations
- **Conflict testing** — Test duplicate endpoint detection

This directory is typically empty unless specific tests require isolated controller configurations.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../test-api/README.md`](../test-api/README.md) — Main test controllers
- [`../harness/README.md`](../harness/README.md) — Test harness that loads controllers
