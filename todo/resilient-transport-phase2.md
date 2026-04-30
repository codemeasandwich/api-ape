# Resilient transport — Phase 2 backlog

**Do not implement until Phase 1 is complete.** Phase 1 scope (reconnect identity: `sessionId` + `clientId`, `wss?resume=`, wiring TTL, dual-channel binding, backoff, docs/scenarios) lives in the Cursor plan **resilient_transport_gap_analysis_e11183c2.plan.md**.

This document retains **§1–§10**, Phase 2 implementation order, cookie stance, **Appendix A**, and open questions — focused on **in-flight RPC**, **mailbox**, **multi-node storage**, and **enterprise** rigor.

## Checklist (from former plan todos)

- [ ] `phase2-inflight-mailbox` — Sequence/watermarks + optional response mailbox; cross-connection replay rules for `queryId`
- [ ] `phase2-clustering-store` — Shared session store / clustering guarantees; rolling restart semantics
- [ ] `phase2-enterprise-backlog` — §2 token rotation depth, observability suite, Appendix A decisions as needed

---

## Phase 2 — In-flight RPC continuity & enterprise rigor (**deferred**)

Phase 2 is **not** the `sessionId` + `clientId` resume story — that is **Phase 1**. Phase 2 closes the gaps **after Phase 1 ships** (see Phase 1 plan table *Ambiguity intentionally deferred to Phase 2*): **`sequenceId` / client watermarks**, **response mailbox** for work completed while the socket was dead, **cross-connection `queryId` / dedupe** semantics, **shared session storage** for multi-node deployments, richer **token lifecycle** (**§2**), **observability** (**§9**), and **Appendix A** choices driven by those features.

**Section mapping (approximate)**:

- **§1–§3**: Identity edge cases, security hardening beyond dual-channel binding, **full** split-brain / epoch dedupe — use alongside Phase 1 where needed; deepen in Phase 2.
- **§4**: **Primary Phase 2** — in-flight RPC / replay protocol.
- **§5**: **Primary Phase 2** — persistence & clustering.
- **§6–§8**: Lifecycle, backoff vs TTL coordination, rollout — often tightened when Phase 2 ships.
- **§9–§10**: Observability & scenario matrix expansion for Phase 2 behaviors.

---
## 1. Identity model & scope (the “per-tab” problem)

**Tension**: Cookies are **shared across tabs** in the same browser profile. Reusing **`apeClientId` for WebSocket logical identity** implies either:

- **Profile-wide logical client**: reconnect or second tab shares one logical session → requires **multi-connection** server semantics (several sockets → one logical session).
- **Per-tab logical client**: a shared cookie **cannot** scope identity to one tab — second tab would “hijack” or merge state unintentionally if the cookie alone is the resume key.

**Explicit decision required** (document before implementation):

| Scope | Client-side carrier | Server implication |
|-------|---------------------|---------------------|
| **Per-tab** (typical for pub/sub + tab-local RPC correlation) | Tab-local secret — e.g. **UUID in `sessionStorage`**, or opaque **resume token** returned by server on first attach and stored tab-locally | Single primary socket per logical session unless multi-tab is explicitly designed |
| **Per browser profile / intentional multi-tab** | Cookie or shared storage acceptable | **Multi-connection** logical session: broadcasts fan-in/out, epoch rules, duplicate suppression |

**Recommendation captured in plan**: If the product means “same tab / same logical client across reconnects”, **do not** rely on the LP cookie alone for WS resume identity. Prefer **server-minted `clientId`** held in **per-instance memory** and resumed via **`wss` URL query** (+ **`sessionId`** cookie binding). Align LP with the same logical model over time as needed.

**Refinement**: Reusing the **same server-issued `clientId`** held in **per-client-instance memory** (post-`__connected__`) avoids introducing a **second** UUID for WebSocket resume — see Phase 1 Cursor plan (**Phase 1 carrier** table).

---

## 2. Security for session resumption

Presenting an identifier to resume a session is a **session fixation / hijack** surface if the token leaks (logs, XSS, network observers, stolen cookie).

**Requirements to specify:**

- **Entropy**: Unguessable resume secret (**≥128 bits**); treat as bearer secret until bound.
- **Binding**: Tie resume to **authenticated context** — e.g. existing `sessionId` / auth token / principal claim — so another user cannot attach to another principal’s logical session.
- **Optional signed tokens**: Short-lived **JWT** (or similar) with claims for logical session id + principal + expiry — reduces server-side plaintext lookup burden if validated cryptographically; tradeoffs for clustered issuance must be documented.
- **Rotation**: On **successful** reattach, **invalidate prior resume capability** and issue **next** token — narrows replay window.
- **Storage**: Prefer **not** storing long-lived resume secrets in **shared cookies** for per-tab models; **HttpOnly** cookie only helps XSS not JS reads — does not fix cross-tab scope ambiguity.

**Plan deliverable**: “Security & token lifecycle” subsection in the protocol doc (issue, bind, verify, rotate, revoke on graceful close / TTL).

---

## 3. Conflict resolution — two connections, one logical id (split-brain)

Partitions, slow TCP teardown, tab duplication, or bugs can leave **two sockets** both believing they represent the same logical session.

**Without rules**: duplicate broadcasts, divergent ordering, stale pushes after state advanced.

**Specify:**

- **Generation / epoch** on the logical session; each successful **attach** increments epoch.
- **Policy**: On new attach, **force-close** the older socket (or stop reading it) **before** treating the new one as authoritative — ordering relative to last processed server epoch must be defined.
- **Stale sends**: Messages from a socket whose epoch is **older** than current → **drop** or **reject** with a defined error so client can reset.
- **Dedupe**: Combine epoch (or logical session scope) with **`queryId` / `sequenceId`** (see §4) so retries do not double-apply side effects.

---

## 4. In-flight RPC semantics (must design **before** final handshake shape)

Persistent logical identity enables solving in-flight replay, but **handshake fields depend on replay semantics**.

**Open design choices** (must resolve in protocol spec):

- **Client-driven retry**: On reconnect, client **re-sends** unacked RPCs with stable **`queryId`** (requires **idempotent** server handlers or dedupe store keyed by logical session + `queryId` / sequence).
- **Server mailbox**: Server **buffers responses** that could not be delivered; on reconnect, **flush mailbox** (bounded, TTL) — needs **cursor** or sequence alignment so client knows what is already satisfied.
- **Ambiguity**: Client often **cannot tell** “never reached server” vs “processed, response lost” without **sequence numbers** → default posture is **at-least-once** send with **server-side dedupe**.

**Recommendation in plan:**

- Introduce **`sequenceId`** (monotonic per logical session for client-originated requests, or bidirectional seq — specify).
- Reconnect handshake carries **`lastAckSeq`** / **`lastReceivedSeq`** from client perspective.
- Server behavior: **replay responses** for sequences **>** client watermark; **ignore duplicate** requests already executed.

This yields **at-least-once** delivery + dedupe — document requirements on application idempotency where needed.

---

## 5. State persistence & multi-node scaling

“In-memory map keyed by id” fails when reconnect hits **another instance** after LB reroute or rolling restart.

**Specify:**

- **Shared store vs stickiness**: Redis (or equivalent) for logical session metadata + mailbox pointers vs **strict session affinity** + documented best-effort only.
- **Minimal durable metadata**: At least **resume verification material**, **epoch**, **last sequence watermark**, **TTL clock** — define what **must** survive process restart for acceptable UX during deploy.
- **Performance**: Cost of cross-node read/write on attach vs every message — optimize path (e.g. attach-time snapshot, local buffering with spill-to-store).

---

## 6. Graceful close & “client lost” — precise contracts

**Graceful close**

- Which **control message** or **WebSocket close code** ends the logical session **immediately** (no resume TTL)?
- Server-initiated eviction (auth expiry): client must receive **unambiguous signal** so it **does not** infinitely reconnect with stale resume material.

**Client lost (TTL)**

- **Configurable** idle/disconnected TTL (example band **30–120s** — final default is a product decision).
- Tradeoff: short TTL → harsh on flaky networks; long TTL → memory and hijack window.

**Partial multi-transport**

- Logical session stays **ACTIVE** if **any** transport path is alive (WS **or** LP), when both exist — **transport-agnostic liveness** matrix.

**State machine** (document explicitly):

- e.g. **`ACTIVE`** ↔ **`DISCONNECTED` (TTL running)** → **`CLOSED`**  
- Side-effects per transition: registry, mailbox discard rules, token revocation.

---

## 7. Unified reconnection backoff

Today browser (**500ms**) vs Node (**exponential + jitter**) diverges.

**Specify unified policy:**

- Exponential backoff + jitter **everywhere**; **tunable** constants.
- **Cap backoff < minimum session TTL** — server advertises TTL (e.g. in `__connected__` or capability payload) so client **does not** sleep past recoverable window.
- **Fast path**: first reconnect attempt **immediate** after abnormal close, then backoff.
- Optional **manual reconnect** API.

---

## 8. Backward compatibility & rollout

- Legacy clients: **no** resume header/message → server keeps **current behavior** (ephemeral per-connection id).
- **Capability negotiation**: version or feature flags in **`__connected__`** (or parallel) so clients opt into logical sessions.
- Explicit distinction: **new logical session** vs **resume attempt** (query param vs Node header — pick one and document).

---

## 9. Observability & developer experience

**Server**

- Structured logs: logical session **created**, **attach**, **detach**, **TTL expiry**, **epoch bump**, **forced eviction**.
- Metrics: TTL expiry rate, **failed/replayed resume**, reconnect success, mailbox depth, duplicate suppressed count.

**Client**

- Distinct events: **transport disconnected** vs **logical session permanently lost** (expired / revoked / graceful) so apps can show **banner vs full resync/login**.

---

## 10. Simulation & testing

**This repo’s policy**: **No unit tests** — prove behavior via **scenario / integration / E2E** tests through public surfaces ([`simulator/`](simulator/), integration runners). The following **must become named scenarios** (not necessarily exhaustive):

- Upgrade succeeds; **first post-upgrade context lost**.
- **Thundering herd** after server restart.
- Client in **long backoff** while **session TTL expires** → logical lost path.
- **Simultaneous** stale + fresh attachment → eviction + ordering.
- **Flush ordering** of queued messages after reattach vs mailbox replay.
- **Cross-node** attach if shared-store path is implemented (or document skip when single-node).

*(Reviewer note “unit + integration non-negotiable” is mapped here to **mandatory integration/E2E coverage** per project constitution.)*

---

## Phase 2 — Revised implementation order (spec-first)

1. **Protocol specification** — state machine, **`sequenceId` / watermarks**, resume + confirm handshake, error codes, mailbox bounds, interaction with existing **`queryId`**.
2. **Token & security model** — generation, binding, rotation, expiry; threat notes.
3. **Storage & clustering** — what lives in shared store, TTL implementation, restart behavior.
4. **Implementation** — server wiring + clients (browser + Node).
5. **Unification & backward compatibility** — capability flags, legacy fallback.
6. **Observability & scenario tests** — metrics/logs + harness scenarios above.

**Rationale**: RPC replay semantics **shape** the handshake; building handshake first without §4 leads to breaking protocol changes later.

---

## Prior “cookie for WS” stance — updated

- **Per-tab logical session**: **Do not** use **`apeClientId` cookie alone** as the WS resume identity; resolve scope first (§1).
- **Profile-wide / multi-tab by design**: Cookie or shared id **can** be part of the story **only with** multi-connection + epoch rules (§3) and security binding (§2).

---

## Appendix A — Decision questionnaire (options + recommendations)

Pick **A / B / C / D** per item (or note hybrid). Defaults below favour **per-tab isolation**, **cluster-ready verification**, and **explicit lifecycle**.

### D1 — Logical identity scope

- **A** Per-tab: one logical session per browsing context; another tab = another session unless explicitly linked  
- **B** Profile-wide: cookie/shared id; server treats multiple tabs as one logical client (multi-connection)  
- **C** Hybrid: default **A**, optional profile-wide mode for named flows  
- **D** Defer feature; keep ephemeral per-socket ids until scope is chosen  

**Recommendation:** **A** — avoids accidental cross-tab hijack of broadcast/embed state; choose **B** only if the product explicitly wants shared sessions across tabs.

### D2 — Browser storage for resume secret (pairs with D1)

- **A** `sessionStorage` (+ in-memory copy while tab is open)  
- **B** Memory only (refresh loses resume unless new bootstrap)  
- **C** `localStorage` (survives refresh; broader XSS impact surface)  
- **D** HttpOnly cookie (same cookie name ⇒ typically shared across tabs on that origin)  

**Recommendation:** **A** when **D1=A**; **D** only when **D1=B** and threat model accepts shared-tab semantics.

### D3 — Node / non-browser clients

- **A** Persist token via app-supplied path (file/env/secrets manager hook)  
- **B** Memory-only for process lifetime  
- **C** Wire protocol matches browser; library exposes persistence hooks only  

**Recommendation:** **C** — flexibility without prescribing deployment; **B** for short-lived workers.

### D4 — Resume token binding (who may attach?)

- **A** Bind to existing app auth (`sessionId`, bearer, etc.) presented on upgrade  
- **B** Cryptographic proof only (e.g. signed JWT claims; no ambient cookie assumption)  
- **C** **A** + **B**  
- **D** Bearer token alone with no principal binding (document as weak)  

**Recommendation:** **C** — reject resume when authenticated principal does not match session owner.

### D5 — Token format

- **A** Opaque high-entropy id + server-side lookup table  
- **B** Signed JWT with minimal claims (logical id, epoch, exp, principal fingerprint)  
- **C** Hybrid: signed attach proof + opaque refresh / rotation chain  
- **D** Reuse string `clientId` alone as resume secret  

**Recommendation:** **B** or **C** for horizontal scale and lower DB hits on hot path; **A** acceptable if shared store is mandatory anyway.

### D6 — Rotation after successful attach

- **A** Issue **new** resume secret every successful attach  
- **B** Rotate on wall-clock timer only  
- **C** Same secret until TTL or graceful close  

**Recommendation:** **A** — limits replay window.

### D7 — Split-brain: two live sockets for same logical id

- **A** New attach wins; **force-close** old socket first; bump epoch  
- **B** Brief dual delivery (both receive broadcasts)  
- **C** Block new attach until old connection fully dead  

**Recommendation:** **A** — textbook mitigation; pair with **D8**.

### D8 — Traffic from stale epoch socket

- **A** Drop silently + metric  
- **B** Specific close code → client resets local state  
- **C** Still process  

**Recommendation:** **A** for inbound garbage; **B** if client must hard-reset cached epoch-dependent state.

### D9 — In-flight RPC replay model

- **A** **`sequenceId`** + client watermark in handshake; server replays undelivered responses and dedupes duplicate requests  
- **B** Mailbox only (no sequence — harder to specify correctness)  
- **C** Client-only resend same `queryId` without sequence protocol  
- **D** No in-flight continuity; only queued-not-sent flush  

**Recommendation:** **A** — drives handshake design; defines at-least-once semantics clearly.

### D10 — Mailbox bounds

- **A** Max **N** entries **and/or** max bytes **and** TTL  
- **B** TTL only  
- **C** Unbounded  

**Recommendation:** **A** — prevents OOM under fan-out.

### D11 — Application semantics on retries

- **A** Document **at-least-once**; apps make handlers idempotent or use application dedupe keys  
- **B** Framework guarantees exactly-once side effects (heavy / domain-specific)  

**Recommendation:** **A** — realistic contract.

### D12 — Logical session persistence / clustering

- **A** Redis-class store  
- **B** RDBMS  
- **C** In-process only + strict stickiness (document failure modes)  
- **D** **Pluggable adapter** + reference Redis implementation  

**Recommendation:** **D** with **A** as reference — survives rolling restarts without locking operators into one vendor.

### D13 — Default disconnected TTL before “client lost”

- **A** 30s  
- **B** 60s  
- **C** 120s  
- **D** No library default; operator-required config  

**Recommendation:** **B** as default + **D** exposure (env/config).

### D14 — Graceful close vs eviction signalling

- **A** Control message **plus** documented WebSocket close codes (logout, eviction, policy)  
- **B** Normal close `1000` only  
- **C** Fully application-defined  

**Recommendation:** **A** — clients distinguish “retry resume” vs “destroy local token”.

### D15 — WS + long-polling under one logical session

- **A** One logical session; **alive if any** transport connected  
- **B** Independent logical sessions per transport  
- **C** WS authoritative; LP never merges  

**Recommendation:** **A** if auto fallback is common; otherwise document **B** as intentional simplicity for v1.

### D16 — Reconnect backoff policy

- **A** Unified exponential + jitter; **cap < TTL/k** (e.g. k=2–4); optional immediate first retry  
- **B** Status quo (browser 500ms vs Node exponential)  
- **C** Fixed interval  

**Recommendation:** **A** + server-advertised TTL in handshake.

### D17 — Backward compatibility

- **A** Capability / version in `__connected__`; missing ⇒ legacy ephemeral ids  
- **B** Separate URL/version path for new protocol  
- **C** Breaking major only  

**Recommendation:** **A** — gradual rollout.

### D18 — Relationship of `apeClientId` (LP) to new logical session

- **A** Converge LP + WS on one logical-session protocol (may deprecate cookie-as-id)  
- **B** Short term: LP keeps cookie identity; WS logical session is separate until unified  
- **C** Cookie carries logical session ref for both (implies **D1=B** risks)  

**Recommendation:** **B** for incremental delivery; target **A** once handshake stabilizes.

### D19 — Observability

- **A** Structured lifecycle logs + metric hooks (counters/histograms)  
- **B** Logs only  
- **C** Metrics only  

**Recommendation:** **A**.

### D20 — Client-facing API shape

- **A** Separate callbacks: transport vs logical-session loss  
- **B** One callback with **reason enum**  
- **C** Only existing `onConnectionChange`  

**Recommendation:** **B** — one surface with explicit reasons beats silent ambiguity of **C**.

---

### Open follow-ups (not multiple-choice)

- **Q1** Must two tabs **explicitly share** one logical session (collaboration)? → drives **D1**.  
- **Q2** Is **v1** required to run **multi-node** without Redis, or is single-node + sticky acceptable initially? → drives **D12** timeline.  
- **Q3** Should server send **“TTL warning”** so clients shorten backoff before expiry?

### Lock-in line

`D1:_ D2:_ D3:_ … D20:_` — fill when approved.
