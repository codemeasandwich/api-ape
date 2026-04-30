# Server Wiring Submodule Files

Phase 1 helpers used by `server/lib/wiring.js` for logical WebSocket reconnect — pairing `(sessionId, clientId)` after disconnect within TTL.

## Directory Structure

```
wiring/
├── resumeRegistry.js   # Pending resume slots + TTL timers
└── upgradeResume.js    # Upgrade-time resume hint parsing + supersede handling
```

## Files

### `resumeRegistry.js`

Registers disconnected client ids for possible reclaim within `APE_RESUME_TTL_MS`, exposes `claimPendingResume` / `cancelPendingResume`, and test helper `resetResumeRegistryForTesting`.

### `upgradeResume.js`

Parses resume hints from upgrade URL / headers, resolves whether to mint a fresh id or supersede a stale live row, and validates session pairing via `sessionIdentity`.
