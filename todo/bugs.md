# Bug Fixes (Completed)

## 1. requestedAt Inconsistency - FIXED

**Problem:** `requestedAt` was conditionally included based on connection state.
- Present: `{"type":"/health","createdAt<!D>":1768382772001,"requestedAt<!D>":1768382772026}`
- Missing: `{"type":"/health","createdAt<!D>":1768382802525}`

**Fix:** Changed [client/connection/sender.js:138](../client/connection/sender.js#L138) to always include `requestedAt`:
```javascript
// Before: requestedAt: directCall ? undefined : new Date(),
// After:  requestedAt: new Date(),
```

---

## 2. Lowercase Endpoint Conversion - FIXED

**Problem:** The api-ape library converted all endpoint names to lowercase.

**Fix:** Removed `.toLowerCase()` from three locations:
- [server/utils/deepRequire.js:213](../server/utils/deepRequire.js#L213) - registration
- [server/socket/receive.js:313](../server/socket/receive.js#L313) - WebSocket resolution
- [server/lib/longPolling/postHandler.js:246](../server/lib/longPolling/postHandler.js#L246) - long polling

Endpoints now preserve their original case from file names.

---

## 3. Inline Base64 for Small Binary - IMPLEMENTED

**Problem:** All binary data required HTTP transfer, even tiny payloads.

**Solution:** Added `I` tag for inline base64 encoding of small binary data (<=100 base64 chars / ~75 bytes).

**Changes:**
- [utils/jss/plugins.js](../utils/jss/plugins.js) - Added `I` to builtInTags
- [utils/jss/decode.js](../utils/jss/decode.js) - Added `I` decoder for base64
- [server/plugins/binary.js](../server/plugins/binary.js) - Added `I` plugin, modified `L` to only handle large binary

**Result:**
- Small binary: `{ "icon<!I>": "SGVsbG8=" }` - inline, no HTTP transfer
- Large binary: `{ "image<!L>": "abc123" }` - HTTP download (existing behavior)

---

## Reference: Server Timing Validation

The server validates `createdAt` in [server/security/reply.js](../server/security/reply.js):

```javascript
// Rejects if createdAt is ahead of server time
if (createdAt > startTime) {
  throw new Error(`createdAt ahead of server by ${(createdAt - startTime) / 1000} secs.`);
}
```

This is working as designed for replay attack prevention.
