# Broadcast Stories Module

## Overview

The broadcast stories module contains test suites for api-ape's broadcast messaging functionality. These tests verify that server-pushed messages reach the correct clients.

**Key capabilities:**

- **Broadcast to others** — Test `broadcastOthers()` excludes sender correctly
- **Late joiner** — Test clients joining after broadcasts don't receive old messages
- **Multiple clients** — Test broadcasts scale to many simultaneous clients
- **Message buffering** — Test client message buffering and retrieval

These stories exercise `broadcast.js`, `send.js`, and client message handling.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Stories overview
- [`../../actions/broadcast/README.md`](../../actions/broadcast/README.md) — Broadcast actions
