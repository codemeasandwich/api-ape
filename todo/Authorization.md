# Authorization strategies report

Below are practical authorization patterns you can mix-and-match for your WebSocket app. They assume: `wss://`, the socket is authenticated per-connection (OPAQUE/SRP), `clientId` is the server-assigned ID bound to the socket, and every message is JSON with `type` (the API path) and/or `targetClientId`. Server is the source of truth for all auth decisions.

---

## 1 — Connection-time role/permission load (baseline)

* On successful auth, load the principal and a *permission set* (roles, scopes, capability IDs) from DB and attach to `socket.principal`.
* For each message: map `msg.type` → required permission(s) and check `socket.permissions` contains them.
* Cache permissions on socket for performance. If permissions change, invalidate (close or re-eval) sockets for that principal.

When to use: simple apps, low-latency needs.
Trade-off: fast, but needs a revocation strategy.

Example mapping:

```js
const apiPerms = {
  "chat/send": "chat:send",
  "chat/history": "chat:read",
  "admin/rooms/create": "rooms:create"
}
```

---

## 2 — Per-message dynamic check (authoritative)

* For each incoming message, run a DB or policy-engine check (ACM/OPA/ABAC) to decide.
* Keep minimal in-memory cache (e.g., 1–5s) for hot checks.
* Use when permissions may change frequently or need recent revocation.

When to use: high-security or multi-admin apps.
Trade-off: higher per-message latency.

---

## 3 — Capability tokens / opaque session handles (no JWT)

* At auth success server issues an in-memory session handle (server-side only, short TTL) mapping to permission set. Client stores nothing special — the server owns the handle.
* For horizontal scaling: store session in central fast store (Redis) keyed by `clientId` or session id.
* Revoke by deleting the handle in Redis and optionally force-close sockets tied to it.

When to use: scale & easy revocation.
Trade-off: needs shared session store for multi-instance servers.

---

## 4 — Object-level ACLs (fine-grained)

* For actions that target resources (documents, rooms, other `clientId`s), maintain ACLs or ownership checks:

  * `resource.owner === principalId` or
  * `ACL[resourceId].includes(principalId)` or
  * `permission.eval(principal, resource, action)` (ABAC)
* Resolve on each request or cache small ACL slices on socket for frequently accessed resources.

Use case: messaging, docs, files.
Tip: include `resourceVersion` in cached ACL to allow invalidation.

---

## 5 — Role-Based + Scope-Based hybrid (fast + flexible)

* Roles cover broad capabilities; scopes are fine-grain operations. At connection load both.
* Map `msg.type` to either role or scope. Example: `admin/*` needs role `admin`; `user:profile:update` needs scope `profile:update`.

When to use: systems with teams/orgs and per-user granular permissions.

---

## 6 — Attribute-Based Access Control (ABAC)

* Express policies based on attributes: user attributes (role, subscription, org), resource attributes (owner, sensitivity), and environment (time, IP).
* Evaluate via a policy engine (Rego/OPA or custom), pass attributes from socket context and message.

When to use: complex policy logic (multi-tenant, enterprise).
Trade-off: more complexity and policy maintenance.

---

## 7 — Capability / Object-scoped signed claims (limited use)

* Server issues per-resource capability handles (opaque, short-lived) that grant a single action (e.g., upload, stream).
* Client includes capability ID in message; server verifies lookup.
* Avoid JWT-style client-trusted claims; keep handles opaque and revokable.

When to use: delegated actions, cross-service calls.
Trade-off: more bookkeeping, but fine revocation.

---

## 8 — Rate limiting & quotas integrated with authz

* Enforce per-principal and per-scope rate limits (Redis token-bucket). Example: `chat:send` 20 msgs/min.
* Apply stricter throttles to unauthenticated/guest sockets.
* Deny further actions or return `rate_limited` responses.

Why: prevents abuse and enforces plan limits.

---

## 9 — Message-level authorization pattern (recommended server-side flow)

1. Authenticate at connect → load `socket.principal`, `socket.permissions`, `socket.authIssuedAt`.
2. For each message:

   * Normalize `type` → canonical API path.
   * Resolve required permission(s) for path.
   * If message targets `targetClientId`, run additional checks: can-sender-message-recipient(principal, targetClientId, channel).
   * If allowed → process; else send `{ type: "authz_fail", reason }`.
3. If permission data expired/changed → re-load or close socket.

This pattern gives clear single place to enforce policy.

Example unauthorized reply:

```json
{ "type":"authz_fail","reason":"missing_scope","required":"chat:send" }
```

---

## 10 — Scoped channels & topic ACLs (pub/sub)

* For pub/sub or rooms, maintain ACL per channel: `channelAcl[channelId] = { publish: [role|userId], subscribe: [...] }`.
* On `subscribe` message, check `socket.permissions` + channel ACL.
* Make `subscribe` idempotent and return `subscribe_ok` / `subscribe_fail`.

Use case: chat rooms, live streams.

---

## 11 — Cross-socket checks (targeting clientId)

* When client A sends to `targetClientId = B`:

  * Option A (simple): allow if A has `chat:send` and B exists and hasn’t blocked A.
  * Option B (strict): require A has `direct_message:create` and B has `dm:receive` or has whitelisted A.
* Enforce recipient privacy (block lists, do-not-disturb, rate limits).

---

## 12 — Revocation & permission change handling

* Best options:

  * Eager: on permission change, find sockets for the user and close them (force re-auth).
  * Lazy: keep sockets open but add a `permissionVersion` check on sensitive messages; when version mismatches, re-eval or close.
* Use a `user.permissions_version` integer in DB; include in `socket.authMeta`. Increment on change.

---

## 13 — Auditing & logging

* Log auth decisions for privileged actions: who, what, when, message-type, outcome.
* Keep small request IDs per message to trace across services.

---

## 14 — Performance & scaling patterns

* Use in-memory caches for permission sets per socket; persist master copy in Redis for multi-node.
* Use sharded Redis or local caches with pub/sub invalidation on change.
* For DB-heavy checks, precompute derived permission bitmaps.

---

## 15 — Practical mixes (recommended combos)

* Simple app: (Connection-time load) + (per-message fast permission check) + (rate limits).
* Messaging app: (Connection-time load) + (channel ACLs) + (blocklists + per-message recipient check).
* Enterprise app: (OPAQUE auth) + (ABAC via policy engine) + (per-message policy evaluation) + (audit logs).
* High security: (PAKE auth) + (per-message DB/policy checks) + (immediate socket invalidation on revocation).

---

## Minimal JSON examples (how server enforces)

Client message:

```json
{
  "type": "chat/send",
  "clientId": "AbCdEf12",
  "targetClientId": "GhIjKl34",
  "body": "hello!"
}
```

Server checks:

1. `socket.authenticated`? if not, require `guest:chat:send` or reject.
2. `hasPermission(socket.permissions, "chat:send")`?
3. `recipientAllows(targetClientId, socket.principal)`?
4. If any fail → send `authz_fail`.

Server reply on success:

```json
{ "type": "chat/send_ok", "msgId":"m-987", "delivered":true }
```

---

## Final security reminders

* Server is authoritative. Never trust client-sent permission claims.
* Bind auth to socket (clientId + PAKE-derived session) to prevent impersonation.
* Enforce least privilege; fail closed (deny if unsure).
* Log auth failures and rate-limit repeated attempts.
