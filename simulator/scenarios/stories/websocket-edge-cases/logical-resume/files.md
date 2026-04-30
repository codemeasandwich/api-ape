# WebSocket logical resume scenarios

Stories validating Phase 1 `(sessionId, clientId)` pairing and resume TTL behavior through the simulator harness.

## Directory Structure

```
logical-resume/
├── reconnect-resumes-same-client-id-within-ttl.js
└── reconnect-with-mismatched-session-mints-new-client-id.js
```

## Files

### `reconnect-resumes-same-client-id-within-ttl.js`

Happy path: reconnect with matching resume hint + session retains prior logical client id within TTL.

### `reconnect-with-mismatched-session-mints-new-client-id.js`

Negative path: mismatched session pairing forces a freshly minted client id even when resume hint matches an incompatible session scope.
