# Session Identification Plan

## Objective
Enable clients to retain their `clientId` across disconnections and reconnections. This ensures that the server recognizes returning clients as the same entity, preserving their state (e.g., subscription channels, specialized functionality) and preventing the proliferation of "ghost" clients.

## Current Architecture
- **WebSockets (`server/lib/wiring.js`)**: Currently generates a fresh `clientId` (20-char random string) for every new connection.
- **Long Polling (`server/lib/longPolling/getHandler.js`)**: Already implements persistence using a cookie named `apeClientId`. Uses this cookie to reuse the `clientId` if present.
- **Session Access**: `api-ape` has access to the HTTP `req` object during the WebSocket handshake (`upgrade` event). This allows access to headers (cookies) and potentially session objects (e.g., `req.session`) if the underlying server framework (like Express) has processed it.

## Proposed Strategy
Integrate `clientId` persistence into the WebSocket handshake by utilizing existing HTTP session mechanisms or cookies, unifying the behavior with the long-polling fallback.

### 1. `clientId` Resolution Logic
Modify `server/lib/wiring.js` to determine the `clientId` using the following precedence:

1.  **Session Storage (Preferred)**: Check if `req.session.apeClientId` exists. If so, use it.
    *   *Requirement*: The host server must have session middleware configured that runs before or during the upgrade step.
2.  **Cookie (Fallback/Standard)**: Check for the `apeClientId` cookie in `req.headers.cookie`.
    *   *Alignment*: This matches the existing behavior of the long-polling transport.
3.  **Generation (Default)**: If neither exists, generate a new `clientId` using `makeid(20)`.

### 2. `clientId` Persistence
Once a `clientId` is determined (whether retrieved or generated), we must ensure it is persisted for future connections:

1.  **Save to Session**: If `req.session` is available, save the ID: `req.session.apeClientId = clientId`.
    *   *Note*: Changes to `req.session` in the upgrade handler must be saved (e.g., `req.session.save()`) if the session store requires it.
2.  **Inform Client (Optional but Recommended)**: The server sends an initial "hello" or "init" message containing the `clientId`. The client library (`api.js`) can then set/update the `apeClientId` cookie to ensure it's sent on the next connection (useful if the session expires or for pure cookie-based persistence).

## Implementation Steps

### 1. Update `server/lib/wiring.js`
Modify the `wiring` function to implement the resolution logic.

```javascript
// Pseudo-code for wiring.js

// Helper to parse cookies from header
const getCookie = (req, name) => { ... }

module.exports = function wiring(controllers, onConnect, fileTransfer) {
    return function webSocketHandler(socket, req) {
        
        let clientId;

        // 1. Try Session
        if (req.session && req.session.apeClientId) {
            clientId = req.session.apeClientId;
        } 
        
        // 2. Try Cookie (if not found in session)
        if (!clientId) {
            clientId = getCookie(req, 'apeClientId');
        }

        // 3. Generate New
        if (!clientId) {
            clientId = makeid(20);
        }

        // 4. Persist back to session if possible
        if (req.session) {
            req.session.apeClientId = clientId;
            // req.session.save() might be needed depending on store
        }

        // ... rest of the setup ...
    }
}
```

### 2. Verify `server/lib/longPolling/*`
Ensure the long-polling handlers (`getHandler.js`, `postHandler.js`) respect the same logic. Currently, they use cookies. We should add a check for `req.session.apeClientId` there as well to keep it consistent if the user relies on server-side sessions.

### 3. Security Considerations
- **Spoofing**: If we rely solely on cookies (`apeClientId`), a malicious user could theoretically impersonate another client if they guess the ID. However, with 20-char random IDs, guessing is infeasible. Stealing the cookie is the main risk (XSS), which is a standard web security concern (mitigated by `HttpOnly`).
- **Session Fixation**: Using `req.session` binds the ID to the server-validated session, offering higher security.

## "Todo" Checklist
- [ ] Modify `server/lib/wiring.js` to read `clientId` from `req.session` or `apeClientId` cookie.
- [ ] Update `server/lib/longPolling/getHandler.js` to also check `req.session`.
- [ ] Update `server/lib/longPolling/postHandler.js` to also check `req.session`.
- [ ] (Optional) Add a mechanism to send the `clientId` back to the client in the handshake/init message so the client can set the cookie if needed.
