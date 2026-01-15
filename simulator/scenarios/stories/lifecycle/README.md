# Lifecycle Stories Module

## Overview

The lifecycle stories module contains test suites for api-ape's connection lifecycle functionality. These tests verify `onConnect` callbacks, embed values, hooks, and disconnect handling.

**Key capabilities:**

- **Connection states** — Test client state transitions
- **Controller context** — Test `this.*` values in controllers
- **onConnect welcome** — Test sending messages on connect
- **Embed values** — Test embedded data accessibility
- **onDisconnect callback** — Test cleanup on disconnect
- **Client tracking** — Test server's connected client tracking

These stories exercise `wiring.js`, lifecycle hooks, and client state management.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Stories overview
- [`../../actions/lifecycle/README.md`](../../actions/lifecycle/README.md) — Lifecycle actions
