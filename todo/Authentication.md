Below I’ll show two compact, exact flows (OPAQUE recommended) and then the authorization placement and the socket state machine you need to enforce your “guest → one-time upgrade → authenticated (no downgrade)” rules.

# Recommended: OPAQUE-based flow (server never learns raw password)

(Assume `wss://`. Server already created `clientId` and sent it on socket setup.)

```
Client                                  Server
  |  (WebSocket open)                    |
  |<-- { clientId } ---------------------|   // server assigned UUID (8-char b64)
  |                                       |
  | (optional)                            |
  | If Sec-WebSocket-Protocol includes 'auth' the server requires auth --->
  |                                       |
  |  Client chooses to auth (anytime):    |
  |-> { type: "auth_start", user: "bob" } |
  |                                       |
  |  Server -> lookup stored OPAQUE envelope for "bob", create serverNonce
  |<- { type: "auth_1", envelope, serverNonce, ts } 
  |                                       |
  |  Client uses password + envelope -> performs OPRF/ClientFinish
  |-> { type: "auth_2", clientPayload, clientProof } 
  |                                       |
  |  Server validates clientProof using envelope -> derives shared session key K
  |  Server produces serverProof (optional mutual proof)
  |<- { type: "auth_ok", serverProof, assignedPrincipal, authMeta } 
  |                                       |
  |  Client verifies serverProof (optional) -> both now have K
  |  Server marks socket state = AUTHENTICATED (binds principal -> clientId)
  |                                       |
  |  From now on: privileged messages allowed; server enforces authz checks
  |                                       |
```

Notes for this flow

* OPAQUE ensures the server never learns the raw password (even during registration/login). The server stores an envelope/verifier only.
* Bind the whole transcript to `clientId`, `serverNonce` and a `clientNonce` the client sends — include these in the OPAQUE inputs so the derived session key is tied to this specific socket. This prevents replay/reuse across connections.
* Make the `auth` exchange strictly one-time: once `AUTHENTICATED`, reject any further `auth_start` attempts on that socket and forbid a transition back to guest.
* If the server requires auth at connect, require the Sec-WebSocket-Protocol header `['auth']` at the handshake and reject/close otherwise. Node: check `req.headers['sec-websocket-protocol']` or `ws.protocol`. This enforces “must auth or reject” at upgrade time.

# SRP flow (if you prefer SRP; server also never sees raw password if client sends verifier at registration)

Same idea but with SRP message names. Server still stores verifier/envelope, and the password is not sent.

```
Client                                Server
 | (WS open)                            |
 |<-- { clientId } ---------------------|
 |                                      |
 |-> { type: "srp_start", user }        |
 |                                      |
 |<- { type: "srp_1", salt, B, serverNonce } 
 |                                      |
 |-> { type: "srp_2", A, clientProof }  // client sends A, then proof M1
 |                                      |
 | Server validates M1 -> derive K, sends M2
 |<- { type: "srp_ok", serverProof, assignedPrincipal, authMeta }
 |                                      |
 | Server marks socket AUTHENTICATED; both derive same session key K
```

Difference: OPAQUE resists active offline dictionary attacks better; both avoid sending raw password.

# Where does authorization happen?

Short answer: **authorization happens immediately after authentication succeeds**, and thereafter whenever the socket attempts privileged actions. Concretely:

1. Authentication success → server maps `clientId` → principal (user id) and loads that principal’s authorizations/roles/claims from server DB or policy engine.
2. Server sets `socket.principal`, `socket.roles`, `socket.authenticated = true` and caches relevant permissions for that socket.
3. Server sends `auth_ok` including `assignedPrincipal` and minimal `authMeta` (roles/expiry). This is only informative; server is the source of truth — **do not trust client-side claims**.
4. For every incoming privileged message, server checks `socket.authenticated` and then runs authorization checks (role/permission check). You can use:

   * eager approach: check once at connection and allow a pre-defined scope until connection end, or
   * conservative approach: check on each request (recommended if permissions can change during session).
5. Never rely on any client-supplied token for permission decisions. Keep authz state server-side (no JWT).

# State machine (enforce your rules)

```
INITIAL (on open)
  ↓ send clientId
GUEST (default)
  - allowed: public messages
  - allowed: start auth (once)
  - if Sec-WebSocket-Protocol required 'auth' && not present => CLOSE

AUTHENTICATING
  - processing PAKE (OPAQUE/SRP)
  - must finish within short timeout
  - on failure -> CLOSE or back to GUEST (if allowed)

AUTHENTICATED
  - socket.principal set
  - no further auth starts allowed
  - no downgrade to GUEST
  - enforce authz on privileged messages
  - on critical reauth events (password change, admin revoke) you can force close or re-evaluate
```

# Extra security & implementation notes

* Always use `wss://` (TLS). PAKE + TLS is defense-in-depth.
* Include `clientId` and per-connection `clientNonce` in the PAKE transcript so the session key is bound to this socket instance. Example canonicalization: `K = PAKE(..., clientId || clientNonce || serverNonce)`.
* One-time serverNonces and short time windows. Discard them after use.
* Limit auth attempts and rate-limit per clientId/IP.
* If you need session resumption later, issue a server-side opaque session handle tied to server state (not a JWT). If you must give the client a token, make it short-lived and revokeable server-side.
* Log auth failures for monitoring but never log secrets or password-derived material.
* If you truly want the server to never see the password even at registration, use an OPAQUE registration flow where the client sends the envelope/verifier only. (That satisfies your “server never gets raw password” requirement.)

Nice — below are compact, exact JSON message shapes for **OPAQUE registration** and **OPAQUE authentication (login)** flows you can wire straight into your WebSocket message handlers. I include required fields, what each side must do, canonicalization notes for binding the session to the socket, and small security rules (nonces, timeouts, one-time use, errors).

# OPAQUE — JSON message shapes

Notes:

* All binary blobs are Base64 strings (`base64`).
* `clientId` is the server-assigned 8-char base64 UUID sent at socket open and must be included in auth messages.
* `clientNonce` and `serverNonce` recommended length: 16–32 bytes (base64). `ts` is millis epoch.
* Use HTTPS/TLS (`wss://`) always.
* Treat all OPAQUE library outputs as opaque blobs; do not try to unpack them in application code.

---

## Registration (server stores an OPAQUE record/envelope only)

Client → Server: start registration

```json
{
  "type": "opaque_reg_start",
  "clientId": "AbCdEf12",        // assigned at ws open
  "user": "alice",
  "clientNonce": "b64(...)",     // random per-connection nonce
  "regRequest": "b64(...)"       // OPAQUE/OPRF registration request blob (from client library)
}
```

Server → Client: server response

```json
{
  "type": "opaque_reg_response",
  "serverNonce": "b64(...)",
  "ts": 1670000000000,
  "regResponse": "b64(...)"      // OPAQUE/OPRF server response blob
}
```

Client → Server: finish registration

```json
{
  "type": "opaque_reg_finish",
  "clientId": "AbCdEf12",
  "user": "alice",
  "clientNonce": "b64(...)",
  "regRecord": "b64(...)"        // OPAQUE registration record/envelope output (to be stored by server)
}
```

Server stores `regRecord` indexed by `user` (and nothing else from the password) and replies:

```json
{ "type": "opaque_reg_ok", "msg": "registered" }
```

Security rules for registration:

* Server must store only the `regRecord`/envelope (and any server-side OPAQUE metadata). Never log raw password or intermediate secrets.
* Enforce rate limits on `opaque_reg_start`.
* `serverNonce` is optional for registration but recommended if you bind reg to this socket.

---

## Authentication (login) — socket upgrade / one-time auth

### 1) Client asks to authenticate

Client → Server:

```json
{
  "type": "opaque_auth_start",
  "clientId": "AbCdEf12",
  "user": "alice",
  "clientNonce": "b64(...)"      // random per-connection
}
```

Server → Client: server sends stored envelope + server auth blob

```json
{
  "type": "opaque_auth_1",
  "serverNonce": "b64(...)",     // one-time per challenge, single-use
  "ts": 1670000000000,
  "envelope": "b64(...)",        // server-stored OPAQUE envelope / record for "alice"
  "oprfResponse": "b64(...)"     // server OPRF / OPAQUE initiation blob (opaque)
}
```

* Server MUST mark this `serverNonce` as single-use and tie it to `clientId`.
* If server requires auth at connect (subprotocol 'auth'), close if not provided.

### 2) Client computes finish and sends proof

Client (using OPAQUE library) consumes `oprfResponse` + password + `envelope` + canonical binding (see below) and produces `clientAuth`:
Client → Server:

```json
{
  "type": "opaque_auth_2",
  "clientId": "AbCdEf12",
  "user": "alice",
  "clientNonce": "b64(...)",     // same as step 1
  "clientAuth": "b64(...)"       // client proof / finish blob (opaque from client library)
}
```

* `clientAuth` proves knowledge of password (without sending password). It implicitly establishes a shared session secret `K` (OPAQUE export key).

### 3) Server verifies and responds with server proof + assigned principal

Server verifies `clientAuth` against stored envelope and its OPAQUE context (including `clientId`, `serverNonce`, `clientNonce`, `ts` if you included timestamps). If valid:
Server → Client:

```json
{
  "type": "opaque_auth_ok",
  "assignedPrincipal": { "userId": "user-123", "roles": ["editor"] }, 
  "serverProof": "b64(...)",     // server proof / finish blob (optional, recommended)
  "authMeta": {
    "issuedAt": 1670000000000,
    "expiresAt": 1670003600000     // server-side session expiry for this socket
  }
}
```

If verification fails, server responds then closes or leaves guest state:

```json
{ "type": "opaque_auth_fail", "reason": "invalid_proof" }
```

Server-side actions on success:

* Mark socket state `AUTHENTICATED`.
* Bind `socket.principal = assignedPrincipal`.
* Record `socket.authIssuedAt` / `authExpiresAt` / `sessionKey` (server-side only). The session key `K` must never be sent.
* Discard `serverNonce` and any one-time state used in the auth exchange.
* Refuse further `opaque_auth_start` on this socket (one-time upgrade).
* Do not allow downgrade to guest.

---

## Canonical binding (how to tie the OPAQUE transcript to the socket)

Although OPAQUE library manages key derivation, include the following canonical inputs to the OPAQUE finish step (either inside `oprf` inputs or as associated data to the export key derivation):

```
canonical = clientId || "|" || clientNonce || "|" || serverNonce || "|" || user || "|" || ts
```

* Both client and server must use the same canonical string in the OPAQUE `context`/`info` parameter (or in the post-KDF) so the derived export key is bound to this exact socket instance. This prevents re-use across connections and replay.

---

## Minimal wire-level example (all messages as JSON)

Below is a tight tracing using small example fields (base64 shortened):

1. server -> client on open:

```json
{ "type": "hello", "clientId": "AbCdEf12" }
```

2. client wants to authenticate later:

```json
{ "type": "opaque_auth_start", "clientId": "AbCdEf12", "user": "alice", "clientNonce": "b64(CN)" }
```

3. server responds:

```json
{
  "type": "opaque_auth_1",
  "serverNonce": "b64(SN)",
  "ts": 1670000000000,
  "envelope": "b64(envelope)",
  "oprfResponse": "b64(oprf)"
}
```

4. client finishes:

```json
{ "type": "opaque_auth_2", "clientId": "AbCdEf12", "user": "alice", "clientNonce": "b64(CN)", "clientAuth": "b64(proof)" }
```

5. server verifies → success:

```json
{ "type": "opaque_auth_ok", "assignedPrincipal": {"userId":"u-123","roles":["user"]}, "serverProof": "b64(sproof)", "authMeta": {"issuedAt":1670000000000, "expiresAt":1670003600000} }
```

---

## Errors, timeouts, replay protections

* `serverNonce` must be single-use and expire quickly (e.g., 30s).
* Timeout for completing auth: e.g., 60s from `opaque_auth_1`.
* Limit auth attempts per `clientId` & IP (e.g., 5/min).
* On repeated failures, enforce backoff and consider closing connection.
* If `opaque_auth_ok` is delivered, treat server as source-of-truth; clients must not assume rights without server confirmation.

---

## Authorization placement & rules (short)

* After `opaque_auth_ok` the server **loads/attaches** the principal’s authorizations and enforces them on all privileged messages.
* You can either: cache a permission set at auth time (fast, but you must revoke by closing sockets on role change) or evaluate authorization on each request (slower, consistent).
* If you support both guest & authenticated on same socket, allow `opaque_auth_start` only while in GUEST state and only once.
