# api-ape Browser Extension Plan

## Executive Summary

A browser extension that provides a powerful developer panel for interacting with api-ape APIs directly from the browser. Accessible via DevTools panel, popup, or side panel - giving developers instant access to endpoint testing, type inspection, live monitoring, and AI-assisted development without leaving their browser.

---

## Why Browser Extension > VS Code Extension

| Aspect | VS Code Extension | Browser Extension |
|--------|-------------------|-------------------|
| **Accessibility** | Only in VS Code | Any browser, any context |
| **Real-time Testing** | Requires running server | Direct access to running app |
| **Live Monitoring** | Separate from app | Same context as app |
| **Cookie/Auth** | Manual configuration | Automatic (same origin) |
| **WebSocket Debugging** | Limited | Native DevTools integration |
| **Response Inspection** | Text-based | Rich JSON viewer |
| **Network Context** | Isolated | Full network stack visibility |
| **Target Audience** | Backend devs | Full-stack + frontend devs |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Extension                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Popup      │  │  Side Panel  │  │ DevTools     │          │
│  │   (Quick)    │  │  (Docked)    │  │ Panel        │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
│                    ┌──────▼───────┐                             │
│                    │   Shared     │                             │
│                    │   React App  │                             │
│                    └──────┬───────┘                             │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                    │
│  ┌──────▼──────┐  ┌───────▼──────┐  ┌──────▼───────┐           │
│  │  Content    │  │  Background  │  │   Storage    │           │
│  │  Script     │  │  Service     │  │   (sync)     │           │
│  │  (inject)   │  │  Worker      │  │              │           │
│  └─────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Web Page Context                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ api-ape     │  │ WebSocket   │  │ Network     │             │
│  │ Client      │  │ Connection  │  │ Requests    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

### 1. Popup (Quick Actions)
- Compact view for quick endpoint testing
- Connection status at a glance
- Recent calls history
- Quick settings toggle

### 2. Side Panel (Chrome 114+)
- Full-featured docked panel
- Persistent while browsing
- All tabs available
- Ideal for development workflow

### 3. DevTools Panel
- Integrated with Chrome DevTools
- Access to network inspection
- Console integration
- Performance profiling

---

## Feature Tabs (Same as VS Code, Adapted for Browser)

### Tab 1: 📂 Endpoints (Tree View)

```
┌─────────────────────────────────────────┐
│ 🦧 api-ape          🟢 Connected   [⚙️] │
├─────────────────────────────────────────┤
│ 🔍 Search endpoints...            [⌘K] │
├─────────────────────────────────────────┤
│ ★ PINNED ──────────────────────── [📌] │
│   ├─ ▶ auth.login                       │
│   ├─ ▶ users.me                         │
│   └─ ▶ posts.create                     │
├─────────────────────────────────────────┤
│ ▼ ENDPOINTS ──────────────────── (47)   │
│   ▼ auth/                         (5)   │
│     ○ login      🔒  → Session          │
│       [▶][📋][📘][📌]                   │
│     ○ logout     🔐  → void             │
│       [▶][📋][📘][📌]                   │
│     ○ register   🔒  → User             │
│     ○ verify     🔐  → boolean          │
│     ○ refresh    🔐  → Token            │
│   ▸ users/                       (12)   │
│   ▸ posts/                       (18)   │
│   ▸ admin/                        (8)   │
│     ○ metrics    🛡️  → Report           │
├─────────────────────────────────────────┤
│ ▼ SCHEMA DIFF ──────────────────────────│
│   + posts.archive (new endpoint)        │
│   ~ users.profile (type changed)        │
│   - admin.legacy  (removed)             │
│   [Apply] [Dismiss] [View Full Diff]    │
├─────────────────────────────────────────┤
│ 💡 Auto-detected from page context      │
└─────────────────────────────────────────┘
```

#### Pinned/Favorites System
- **Pin/unpin action** per endpoint via [📌] button
- **Persistent storage** via `chrome.storage.sync`
- **Quick access** at top of tree view
- **Edit mode** to reorder pinned endpoints
- **Drag & drop** reordering support

#### Auth Level Indicators
Visual badges showing authentication requirements per endpoint:
- 🔒 **Public** - No authentication required
- 🔐 **Auth Required** - User must be logged in
- 🛡️ **Admin Only** - Requires admin privileges

#### Inline Action Buttons
Quick actions on each endpoint row:
```
[▶] = Test endpoint (opens Test tab)
[📋] = Copy API call to clipboard
[📘] = View types (opens Types tab)
[📌] = Pin/unpin from favorites
```

#### Schema Diff Detection
Automatically detects changes between cached and live schema:
- `+` New endpoints added (green)
- `~` Modified endpoints/types (yellow)
- `-` Removed endpoints (red)
- **Apply** - Accept changes and update cache
- **Dismiss** - Ignore changes
- **View Full Diff** - Detailed comparison view

**Browser-Specific Features:**
- Auto-detect api-ape on current page
- Inject schema fetcher into page context
- Sync with page's WebSocket connection
- Context menu integration ("Test this endpoint")

---

### Tab 2: ▶ Test (Request Builder)

```
┌─────────────────────────────────────────┐
│ ▼ REQUEST ──────────────────────────────│
│                                         │
│ Endpoint: [auth.login              ▾]   │
│           [🔍 Search or select...     ] │
│                                         │
│ Input:                                  │
│ ┌───────────────────────────────────┐   │
│ │ {                                 │   │
│ │   "email": "user@example.com",    │   │
│ │   "password": "secret123"         │   │
│ │ }                                 │   │
│ └───────────────────────────────────┘   │
│ │ Valid JSON ✓ │ Schema valid ✓     │   │
│                                         │
│ Headers:  [+ Add Custom Header]         │
│ ├─ Authorization: Bearer ****           │
│ └─ X-Request-ID: auto-generated         │
│                                         │
│ ☑ Use page cookies    ☑ Include auth    │
│                                         │
│ [▶ Execute]  [💾 Save]  [🔗 cURL]      │
│                                         │
├─────────────────────────────────────────┤
│ ▼ RESPONSE ─────────────────────────────│
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ ✓ 200 OK │ 23ms │ 412 bytes       │   │
│ ├───────────────────────────────────┤   │
│ │ ▼ {                               │   │
│ │     "token": "eyJhbG...",         │   │
│ │   ▼ "user": {                     │   │
│ │       "id": 1,                    │   │
│ │       "email": "user@example.com" │   │
│ │     }                             │   │
│ │   }                               │   │
│ └───────────────────────────────────┘   │
│                                         │
│ [📋 Copy] [🔍 Inspect] [➕ Add to Flow] │
│                                         │
├─────────────────────────────────────────┤
│ ▼ HISTORY ─────────────────────── (24)  │
│   ✓ auth.login      23ms   200   12:34  │
│   ✓ users.profile   45ms   200   12:33  │
│   ✗ posts.create    12ms   401   12:32  │
│   ✓ auth.refresh    18ms   200   12:31  │
│                                         │
│ [🗑 Clear] [📥 Export] [🔄 Replay]      │
│                                         │
├─────────────────────────────────────────┤
│ ▼ SAVED REQUESTS ───────────────────────│
│   📁 Auth flows                         │
│     └─ Login as admin                   │
│     └─ Login as user                    │
│     └─ Token refresh flow               │
│   📁 Test data                          │
│     └─ Create sample post               │
│     └─ Bulk user creation               │
│                                         │
│ [+ New Collection] [📤 Export] [📥 Import]
└─────────────────────────────────────────┘
```

#### Request Headers Management
- **Custom headers** - Add any HTTP headers
- **Auto-populated** - Authorization, X-Request-ID
- **Masked values** - Sensitive data hidden with ****
- **Header templates** - Save common header sets

#### Saved Request Collections
Organize and persist requests for reuse:
- **Folder organization** - Group related requests
- **Named saved requests** - Descriptive names for each
- **Import/Export** - Share collections as JSON
- **Postman compatible** - Import from Postman collections

#### Export Formats
Multiple export options for requests:
- **cURL** - Command line format
- **Fetch** - JavaScript fetch() code
- **HAR** - HTTP Archive format
- **Postman** - Postman collection format

**Browser-Specific Features:**
- **Use page cookies** - Automatic auth from browser
- **Same-origin requests** - No CORS issues
- **Inspect in DevTools** - Send response to Network panel
- **Intercept mode** - Modify requests before they're sent
- **Replay from Network** - Re-run captured requests

---

### Tab 3: 📘 Types (Type Browser)

```
┌─────────────────────────────────────────┐
│ 🔍 Search types...                      │
├─────────────────────────────────────────┤
│ ▼ VIEW MODE ────────────────────────────│
│   ○ By Interface   ● By Endpoint        │
│   ○ By Module      ○ Alphabetical       │
├─────────────────────────────────────────┤
│ ▼ INTERFACES ───────────────────── (23) │
│   📘 User                               │
│   📘 Session                            │
│   📘 Post                               │
│   📘 Comment                            │
│   📘 AuthToken                          │
│   📘 PaginatedResponse<T>               │
│   📘 ErrorResponse                      │
├─────────────────────────────────────────┤
│ ▼ ENDPOINTS → User ─────────────────────│
│   ├─ users.profile                      │
│   ├─ users.getById                      │
│   ├─ users.update                       │
│   └─ auth.register                      │
│ ▸ Returns: Session                      │
│ ▸ Returns: Post[]                       │
│ ▸ Returns: void                         │
├─────────────────────────────────────────┤
│ ▼ TYPE DEFINITION ──────────────────────│
│ ┌───────────────────────────────────┐   │
│ │ /**                               │   │
│ │  * Represents a user account      │   │
│ │  */                               │   │
│ │ interface User {                  │   │
│ │   /** Unique identifier */        │   │
│ │   id: number;                     │   │
│ │   /** User's email address */     │   │
│ │   email: string;                  │   │
│ │   /** Display name */             │   │
│ │   name: string;                   │   │
│ │   /** Profile picture URL */      │   │
│ │   avatar?: string;                │   │
│ │   /** Account creation date */    │   │
│ │   createdAt: Date;                │   │
│ │   /** User's role */              │   │
│ │   role: 'user' | 'admin';         │   │
│ │ }                                 │   │
│ └───────────────────────────────────┘   │
│                                         │
│ [📋 Copy] [📝 Edit] [🔍 Find Usage]    │
│                                         │
├─────────────────────────────────────────┤
│ ▼ SDK GENERATION ───────────────────────│
│                                         │
│ Target Language:                        │
│ ┌─────────────────────────────────┐     │
│ │ ● TypeScript    ○ Python        │     │
│ │ ○ Go            ○ Rust          │     │
│ │ ○ C#            ○ Java          │     │
│ └─────────────────────────────────┘     │
│                                         │
│ Options:                                │
│ ☑ Include JSDoc comments                │
│ ☑ Generate Zod schemas                  │
│ ☐ Generate React Query hooks            │
│ ☐ Generate mock data factories          │
│ ☑ Include API client wrapper            │
│                                         │
│ Output: [.api-ape/          ] [📂]     │
│                                         │
│ [⚡ Generate SDK]  [📂 Open Output]     │
├─────────────────────────────────────────┤
│ ▼ GENERATED FILES ──────────────────────│
│   📄 .api-ape/api-ape.d.ts       2.4kb  │
│   📄 .api-ape/schema.json        8.1kb  │
│   📄 .api-ape/zod-schemas.ts     3.2kb  │
│                                         │
│   Last generated: 5 min ago             │
│   [🔄 Regenerate] [📂 Open Folder]      │
└─────────────────────────────────────────┘
```

#### Type View Modes
Multiple ways to browse types:
- **By Interface** - Alphabetical list of all interfaces
- **By Endpoint** - Types grouped by which endpoints return them
- **By Module** - Organized by namespace/module
- **Alphabetical** - Simple A-Z listing

#### Endpoints Grouped by Return Type
See which endpoints return each type:
```
▼ Returns: User
  ├─ users.profile
  ├─ users.getById
  └─ auth.register
```

#### Multi-Language SDK Generation
Generate SDKs for multiple languages:
- **TypeScript** - Full type definitions with JSDoc
- **Python** - Type hints and dataclasses
- **Go** - Struct definitions
- **Rust** - Serde-compatible structs
- **C#** - Class definitions
- **Java** - POJOs with annotations

**Browser-Specific Features:**
- **Download as file** - Generate .d.ts directly
- **Copy to clipboard** - For quick paste into IDE
- **Validate response** - Check if response matches type
- **Generate from response** - Infer types from actual data

---

### Tab 4: 📡 Live (Real-time Monitor)

```
┌─────────────────────────────────────────┐
│ ▼ HEALTH DASHBOARD ─────────────────────│
│ ┌───────────────────────────────────┐   │
│ │  ████████████████░░  92% healthy  │   │
│ │  47/51 endpoints responding       │   │
│ └───────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ▼ SERVERS ──────────────────────────────│
│                                         │
│ 🟢 PRIMARY    localhost:3000            │
│    Latency: 12ms │ Uptime: 99.9%        │
│    Endpoints: 47 │ Last: now            │
│                                         │
│ 🟡 STAGING    staging.api.com           │
│    Latency: 89ms │ Uptime: 98.2%        │
│    Endpoints: 45 │ Last: 2m ago         │
│                                         │
│ ⚪ PROD       api.example.com           │
│    Not connected                        │
│                                         │
│ [+ Add Server] [🔧 Configure]           │
│                                         │
├─────────────────────────────────────────┤
│ ▼ CHANNELS ────────────────────── (3)   │
│                                         │
│ 📡 notifications    142 subs   45/min   │
│    [👁 Monitor] [📤 Send Test]          │
│                                         │
│ 📡 chat:general      38 subs  120/min   │
│    [👁 Monitor] [📤 Send Test]          │
│                                         │
│ 📡 presence          67 subs    8/min   │
│    [👁 Monitor] [📤 Send Test]          │
│                                         │
│ [+ Create Channel] [📊 Statistics]      │
│                                         │
├─────────────────────────────────────────┤
│ ▼ CONNECTED CLIENTS ────────────  (247) │
│ ┌───────────────────────────────────┐   │
│ │ 🖥️ Desktop    ████████    67%     │   │
│ │ 📱 Mobile     ███         28%     │   │
│ │ 🤖 Bot/API    █            5%     │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Recent Connections:                     │
│  • Chrome/Win  192.168.1.42       2m    │
│  • Safari/iOS  192.168.1.88       5m    │
│  • Node.js     10.0.0.5          12m    │
│                                         │
│ [📊 Client Analytics]                   │
│                                         │
├─────────────────────────────────────────┤
│ ▼ LIVE ACTIVITY ────────────────────────│
│ ┌───────────────────────────────────┐   │
│ │ ↑ 12:45:23 auth.login             │   │
│ │            user@example.com       │   │
│ │ ↓ 12:45:23 200 OK 23ms            │   │
│ │            {token: "eyJ..."}      │   │
│ │ ⚡ 12:45:20 broadcast              │   │
│ │            notifications → 142    │   │
│ │ ✗ 12:45:15 admin.delete           │   │
│ │            403 Forbidden          │   │
│ └───────────────────────────────────┘   │
│                                         │
│ [⏸ Pause] [🔍 Filter] [📥 Export HAR]  │
│                                         │
├─────────────────────────────────────────┤
│ ▼ ALERTS ───────────────────────── (2)  │
│                                         │
│ ⚠️  High latency: users.search          │
│     Avg 450ms (threshold: 200ms)        │
│     [Investigate] [Dismiss]             │
│                                         │
│ ⚠️  Rate limit: 85% of threshold        │
│     IP: 192.168.1.42                    │
│     [Block] [Whitelist] [Dismiss]       │
│                                         │
│ [⚙️ Configure Alerts]                   │
└─────────────────────────────────────────┘
```

#### Multi-Server Connection Management
Switch between development environments:
- **Add/Remove servers** - localhost, staging, production
- **Per-server status** - Connection state, latency, uptime
- **Quick switch** - Change active server instantly
- **Auto-reconnect** - Automatic failover

#### Health Dashboard
Visual endpoint health overview:
- **Percentage bar** - Overall API health
- **Endpoint count** - Responding vs total
- **Status indicators** - Green/Yellow/Red

#### Connected Clients Analytics
Real-time client breakdown:
- **Device distribution** - Desktop, Mobile, Bot
- **Recent connections** - IP, browser, timing
- **Detailed analytics** - Full client reports

#### Activity Stream Indicators
Visual activity type markers:
- `↑` Outgoing request (blue)
- `↓` Incoming response (green)
- `⚡` Broadcast/pub-sub message (yellow)
- `✗` Error response (red)

#### Alerts System
Configurable monitoring alerts:
- **Latency threshold** - Alert when avg > threshold
- **Error rate** - Alert on high error percentage
- **Rate limiting** - Warning when approaching limits
- **Custom alerts** - Define your own triggers

**Browser-Specific Features:**
- **Observe page WebSocket** - See all messages without injection
- **HAR export** - Standard HTTP Archive format
- **DevTools Network sync** - Correlate with Network panel
- **Subscribe to channels** - Join broadcast channels live
- **Message inspector** - Detailed view of WS frames

---

### Tab 5: 🎨 Design (Schema Editor)

```
┌─────────────────────────────────────────┐
│ Mode: ○ View  ● Edit  ○ Mock  ○ Compare │
├─────────────────────────────────────────┤
│ ▼ VISUAL SCHEMA ────────────────────────│
│ ┌───────────────────────────────────┐   │
│ │    ┌──────────┐   ┌──────────┐    │   │
│ │    │  auth/   │   │  users/  │    │   │
│ │    │──────────│   │──────────│    │   │
│ │    │ login    │──▶│ profile  │    │   │
│ │    │ logout   │   │ settings │    │   │
│ │    │ register │──▶│ avatar   │    │   │
│ │    │ verify   │   │ list     │    │   │
│ │    │ refresh  │   │ getById  │    │   │
│ │    └──────────┘   └──────────┘    │   │
│ │         │              │          │   │
│ │         ▼              ▼          │   │
│ │    ┌──────────┐   ┌──────────┐    │   │
│ │    │ Session  │   │   User   │    │   │
│ │    │──────────│   │──────────│    │   │
│ │    │ token    │   │ id       │    │   │
│ │    │ userId   │──▶│ email    │    │   │
│ │    │ expiresAt│   │ name     │    │   │
│ │    └──────────┘   └──────────┘    │   │
│ └───────────────────────────────────┘   │
│ [🔍+] [🔍-] [⟲ Reset] [📸 Export PNG]  │
│                                         │
│ [+ Namespace] [+ Endpoint] [+ Type]     │
│                                         │
├─────────────────────────────────────────┤
│ ▼ ENDPOINT EDITOR ──────────────────────│
│                                         │
│ Editing: users/profile                  │
│                                         │
│ Path: users / [profile        ]         │
│                                         │
│ Description:                            │
│ [Get the current user's profile       ] │
│                                         │
│ Input Type:                             │
│ ┌─────────────────────────────────┐     │
│ │ ● None                          │     │
│ │ ○ Object: { ... }               │     │
│ │ ○ Existing: [Select type ▾]     │     │
│ └─────────────────────────────────┘     │
│                                         │
│ Return Type: [User             ▾]       │
│                                         │
│ ▼ Advanced Options                      │
│ ┌─────────────────────────────────┐     │
│ │ Authentication:                 │     │
│ │ [🔐 Required              ▾]    │     │
│ │                                 │     │
│ │ ☐ Rate limited (req/min): [60]  │     │
│ │ ☐ Cached (TTL seconds): [300]   │     │
│ │ ☐ Broadcast changes             │     │
│ │ ☐ Deprecated                    │     │
│ └─────────────────────────────────┘     │
│                                         │
│ [💾 Save] [▶ Test] [🗑 Delete]          │
│                                         │
├─────────────────────────────────────────┤
│ ▼ TYPE EDITOR ──────────────────────────│
│                                         │
│ Editing: User                           │
│ ┌───────────────────────────────────┐   │
│ │ Fields:                     [+]   │   │
│ │ ├─ id: number           [🗑]     │   │
│ │ ├─ email: string        [🗑]     │   │
│ │ ├─ name: string         [🗑]     │   │
│ │ ├─ avatar?: string      [🗑]     │   │
│ │ └─ role: 'user'|'admin' [🗑]     │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Adding field:                           │
│ Name: [updatedAt    ] Type: [Date▾]     │
│ ☐ Optional  ☐ Array  [+ Add Field]      │
│                                         │
├─────────────────────────────────────────┤
│ ▼ MOCK SERVER ──────────────────────────│
│                                         │
│ ☑ Enable mock responses                 │
│                                         │
│ users.profile:                          │
│ ┌───────────────────────────────────┐   │
│ │ { "id": 1, "name": "Mock User" }  │   │
│ └───────────────────────────────────┘   │
│ Delay: [200ms ▾]  Status: [200 ▾]       │
│                                         │
│ [💾 Save Mocks] [📤 Export] [🔄 Reset]  │
├─────────────────────────────────────────┤
│ ▼ VALIDATION ───────────────────────────│
│   ✓ Schema valid                        │
│   ✓ No circular dependencies            │
│   ✓ All types resolved                  │
│   ⚠ 2 endpoints missing descriptions    │
│                                         │
│ [🔄 Validate] [📤 Export OpenAPI]       │
│ [📥 Import Swagger]                     │
└─────────────────────────────────────────┘
```

#### Design Modes
- **View** - Read-only schema inspection
- **Edit** - Modify endpoints and types
- **Mock** - Configure mock responses
- **Compare** - Side-by-side diff of live vs local schema

#### Endpoint Editor
Full endpoint configuration:
- **Path** - Namespace and endpoint name
- **Description** - JSDoc-style documentation
- **Input Type** - None, inline object, or existing type
- **Return Type** - Select from available types
- **Advanced Options:**
  - Authentication level (public/auth/admin)
  - Rate limiting configuration
  - Response caching with TTL
  - Broadcast on change flag
  - Deprecation marker

#### Type Editor with Field Management
Inline type editing:
- **Add fields** - Name, type, optional/required
- **Remove fields** - Delete with confirmation
- **Edit inline** - Modify field types directly
- **Array support** - Mark fields as arrays

**Browser-Specific Features:**
- **Mock Server** - Intercept requests and return mock data
- **Request interception** - Modify requests/responses on the fly
- **Import/Export** - OpenAPI, Swagger, Postman collections
- **Schema diff** - Compare live vs local schema
- **Hot reload** - Changes apply immediately

---

### Tab 6: 💡 AI (Smart Assistant)

```
┌─────────────────────────────────────────┐
│ ▼ ASK AI ───────────────────────────────│
│ ┌───────────────────────────────────┐   │
│ │ Ask anything about your API...    │   │
│ │                                   │   │
│ │ [                              ]  │   │
│ │                                   │   │
│ │ Try: "Which endpoints need auth?" │   │
│ │      "Show all POST endpoints"    │   │
│ │      "Find unused types"          │   │
│ └───────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ▼ SUGGESTIONS ──────────────────── (5)  │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ 🔒 Security                       │   │
│ │ ─────────────────────────────────│   │
│ │ Add rate limiting to public       │   │
│ │ endpoints                         │   │
│ │                                   │   │
│ │ 3 endpoints exposed without       │   │
│ │ rate limits: auth.login,          │   │
│ │ auth.register, users.search       │   │
│ │                                   │   │
│ │ [Apply] [Learn More] [Dismiss]    │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ 📝 Documentation                  │   │
│ │ ─────────────────────────────────│   │
│ │ Add JSDoc to 12 endpoints         │   │
│ │                                   │   │
│ │ Missing descriptions for:         │   │
│ │ posts.archive, admin.metrics...   │   │
│ │                                   │   │
│ │ [Auto-Generate] [View All]        │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ 🧪 Testing                        │   │
│ │ ─────────────────────────────────│   │
│ │ Generate tests for auth.*         │   │
│ │                                   │   │
│ │ 0/5 auth endpoints have tests     │   │
│ │                                   │   │
│ │ [Generate Tests] [Configure]      │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ ⚡ Performance                    │   │
│ │ ─────────────────────────────────│   │
│ │ Add caching to users.profile      │   │
│ │                                   │   │
│ │ Called 450 times/hour, returns    │   │
│ │ same data for same user           │   │
│ │                                   │   │
│ │ [Add Cache] [Ignore]              │   │
│ └───────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ▼ WORKFLOW TEMPLATES ───────────────────│
│                                         │
│ 🚀 Quick Actions:                       │
│ ┌─────────────────────────────────┐     │
│ │ [📦 New CRUD Endpoint       ]   │     │
│ │ [🔐 Add Authentication      ]   │     │
│ │ [📡 Create Broadcast Channel]   │     │
│ │ [🧪 Generate Test Suite     ]   │     │
│ │ [📊 Add Monitoring          ]   │     │
│ │ [📄 Generate Documentation  ]   │     │
│ └─────────────────────────────────┘     │
│                                         │
├─────────────────────────────────────────┤
│ ▼ CHAT HISTORY ─────────────────────────│
│                                         │
│ You: "Which endpoints are slowest?"     │
│ AI: Based on monitoring data:           │
│     1. users.search (avg 450ms)         │
│     2. posts.list (avg 230ms)           │
│     3. admin.report (avg 180ms)         │
│     [View Details]                      │
│                                         │
│ You: "How can I speed up search?"       │
│ AI: Consider these optimizations:       │
│     • Add database index on...          │
│     • Implement pagination...           │
│     • Cache frequent queries...         │
│     [Apply Suggestion]                  │
│                                         │
│ [🗑 Clear History]                      │
│                                         │
├─────────────────────────────────────────┤
│ ▼ QUICK ACTIONS ────────────────────────│
│                                         │
│ [🧪 Generate Test Data]                 │
│ [📋 Copy as Fetch]                      │
│ [🔄 Create Request Flow]                │
│ [📊 Performance Report]                 │
└─────────────────────────────────────────┘
```

#### AI-Powered Suggestions
Proactive recommendations based on your API:
- **Security** - Rate limiting, authentication gaps
- **Documentation** - Missing JSDoc, descriptions
- **Testing** - Uncovered endpoints, test generation
- **Performance** - Caching opportunities, slow endpoints

#### Workflow Templates
Quick-start templates for common tasks:
- **New CRUD Endpoint** - Generate complete CRUD operations
- **Add Authentication** - Set up auth middleware
- **Create Broadcast Channel** - Configure pub/sub
- **Generate Test Suite** - Auto-create test files
- **Add Monitoring** - Set up metrics and alerts
- **Generate Documentation** - Create OpenAPI/Swagger docs

#### Chat History
Persistent AI conversation:
- **Full context** - AI remembers previous questions
- **Actionable responses** - Apply suggestions directly
- **Clear history** - Start fresh when needed
- **Export** - Save conversations for reference

**Browser-Specific Features:**
- **Debug assistance** - Analyze failed requests in context
- **Generate test data** - Create realistic mock data
- **Request flows** - Chain multiple requests together
- **Performance insights** - Based on actual Network data
- **Error explanation** - Human-readable error analysis

---

## Unique Browser Extension Features

### 1. Request Interception & Mocking

```javascript
// Intercept and mock responses
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (shouldMock(details.url)) {
      return { redirectUrl: getMockDataUrl(details) };
    }
  },
  { urls: ["*://*/api/*"] },
  ["blocking"]
);
```

### 2. Page Context Integration

```javascript
// Content script injects into page
window.__API_APE_DEVTOOLS__ = {
  getSchema: () => window.api?.__schema__,
  getClient: () => window.api,
  intercept: (endpoint, handler) => { ... },
  observe: (callback) => { ... }
};
```

### 3. DevTools Network Correlation

```javascript
// Link extension requests to Network panel
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isApiApeRequest(request)) {
    addToHistory(request);
    analyzePerformance(request);
  }
});
```

### 4. WebSocket Frame Inspector

```javascript
// Capture WebSocket messages
chrome.devtools.network.onNavigated.addListener(() => {
  // Inject WS interceptor
  chrome.devtools.inspectedWindow.eval(`
    const origWS = WebSocket;
    WebSocket = function(...args) {
      const ws = new origWS(...args);
      ws.addEventListener('message', (e) => {
        window.postMessage({ type: 'WS_MESSAGE', data: e.data });
      });
      return ws;
    };
  `);
});
```

### 5. Schema Diff & Sync

```javascript
// Compare cached vs live schema
async function detectSchemaChanges() {
  const cached = await storage.get('schema');
  const live = await fetchSchema();

  return {
    added: findNewEndpoints(cached, live),
    modified: findModifiedEndpoints(cached, live),
    removed: findRemovedEndpoints(cached, live)
  };
}
```

---

## Command Palette

Global search and quick actions accessible via `⌘K` (Mac) or `Ctrl+K` (Windows/Linux).

```
┌─────────────────────────────────────────┐
│ 🔍 api-ape: [                        ]  │
├─────────────────────────────────────────┤
│ Recent:                                 │
│   ○ auth.login                          │
│   ○ users.profile                       │
│   ○ posts.create                        │
│                                         │
│ Actions:                                │
│   ⚡ Generate SDK                       │
│   🔄 Refresh Schema                     │
│   ▶ Test Endpoint...                    │
│   📘 View Type...                       │
│   📡 Monitor Channel...                 │
│   🎨 Open Schema Designer               │
│   ⚙️ Open Settings                      │
│                                         │
│ Endpoints:                              │
│   ○ auth.login      → Session           │
│   ○ auth.logout     → void              │
│   ○ auth.register   → User              │
│   ○ users.profile   → User              │
│   ...                                   │
│                                         │
│ Types:                                  │
│   📘 User                               │
│   📘 Session                            │
│   📘 Post                               │
│   ...                                   │
└─────────────────────────────────────────┘
```

### Command Palette Features
- **Fuzzy search** - Match endpoints, types, and actions
- **Recent items** - Quick access to recently used
- **Keyboard navigation** - Arrow keys + Enter
- **Direct actions** - Run commands without clicking
- **Context awareness** - Different options per tab

---

## Settings Modal

Comprehensive settings organized by category:

```
┌─────────────────────────────────────────┐
│ ⚙️ Settings                        [✕]  │
├─────────────────────────────────────────┤
│ ▼ Connection                            │
│   Server URL: [localhost:3000        ]  │
│   Auto-connect: [✓]                     │
│   Timeout (ms): [5000                ]  │
│   Reconnect attempts: [3             ]  │
│                                         │
│ ▼ Type Generation                       │
│   Output path: [.api-ape/            ]  │
│   Auto-generate: [✓]                    │
│   Watch mode: [✓]                       │
│   Include comments: [✓]                 │
│                                         │
│ ▼ UI Preferences                        │
│   Default tab: [📂 Tree           ▾]    │
│   Show auth badges: [✓]                 │
│   Compact mode: [ ]                     │
│   Theme: [System ▾]                     │
│                                         │
│ ▼ Monitoring                            │
│   Enable activity stream: [✓]           │
│   Max history items: [100            ]  │
│   Alert thresholds:                     │
│     Latency (ms): [200               ]  │
│     Error rate (%): [5               ]  │
│                                         │
│ ▼ AI Assistant                          │
│   Enable suggestions: [✓]               │
│   Auto-analyze errors: [✓]              │
│   Save chat history: [✓]                │
│                                         │
│ [Save] [Reset to Defaults] [Cancel]     │
└─────────────────────────────────────────┘
```

---

## Technical Stack

### Framework & Build
```
├── React 18 + TypeScript
├── Vite (fast HMR for development)
├── TailwindCSS (styling)
├── Zustand (state management)
├── React Query (data fetching)
└── Monaco Editor (code editing)
```

### Extension APIs
```
├── chrome.devtools.panels    (DevTools panel)
├── chrome.sidePanel          (Side panel)
├── chrome.action             (Popup)
├── chrome.storage.sync       (Settings sync)
├── chrome.webRequest         (Request interception)
├── chrome.scripting          (Content scripts)
└── chrome.devtools.network   (Network inspection)
```

### Browser Support
- Chrome 114+ (Side Panel API)
- Firefox 109+ (Sidebar)
- Edge 114+ (Chromium-based)
- Safari (limited, Web Extension API)

---

## File Structure

```
browser-extension/
├── manifest.json              # Extension manifest (v3)
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── popup/                 # Popup entry
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Popup.tsx
│   │
│   ├── sidepanel/            # Side panel entry
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── SidePanel.tsx
│   │
│   ├── devtools/             # DevTools panel
│   │   ├── index.html
│   │   ├── devtools.ts       # Creates panel
│   │   ├── panel.html
│   │   └── Panel.tsx
│   │
│   ├── background/           # Service worker
│   │   └── service-worker.ts
│   │
│   ├── content/              # Content scripts
│   │   ├── inject.ts         # Injected into page
│   │   └── bridge.ts         # Communication bridge
│   │
│   ├── shared/               # Shared code
│   │   ├── components/       # React components
│   │   │   ├── EndpointTree.tsx
│   │   │   ├── PinnedEndpoints.tsx
│   │   │   ├── SchemaDiff.tsx
│   │   │   ├── RequestBuilder.tsx
│   │   │   ├── ResponseViewer.tsx
│   │   │   ├── RequestCollections.tsx
│   │   │   ├── TypeBrowser.tsx
│   │   │   ├── TypeEditor.tsx
│   │   │   ├── SDKGenerator.tsx
│   │   │   ├── LiveMonitor.tsx
│   │   │   ├── ServerManager.tsx
│   │   │   ├── ClientAnalytics.tsx
│   │   │   ├── AlertsPanel.tsx
│   │   │   ├── SchemaEditor.tsx
│   │   │   ├── EndpointEditor.tsx
│   │   │   ├── SchemaCanvas.tsx
│   │   │   ├── AIAssistant.tsx
│   │   │   ├── WorkflowTemplates.tsx
│   │   │   ├── ChatHistory.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   └── SettingsModal.tsx
│   │   │
│   │   ├── hooks/            # React hooks
│   │   │   ├── useSchema.ts
│   │   │   ├── useSchemaDiff.ts
│   │   │   ├── useEndpoints.ts
│   │   │   ├── usePinnedEndpoints.ts
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useMultiServer.ts
│   │   │   ├── useAlerts.ts
│   │   │   ├── useStorage.ts
│   │   │   └── useKeyboardShortcuts.ts
│   │   │
│   │   ├── stores/           # Zustand stores
│   │   │   ├── schemaStore.ts
│   │   │   ├── historyStore.ts
│   │   │   ├── collectionsStore.ts
│   │   │   ├── serversStore.ts
│   │   │   ├── alertsStore.ts
│   │   │   ├── chatStore.ts
│   │   │   └── settingsStore.ts
│   │   │
│   │   ├── utils/            # Utilities
│   │   │   ├── api.ts
│   │   │   ├── schema.ts
│   │   │   ├── schemaDiff.ts
│   │   │   ├── mock.ts
│   │   │   ├── export.ts
│   │   │   └── keyboardShortcuts.ts
│   │   │
│   │   └── styles/           # Shared styles
│   │       └── globals.css
│   │
│   └── types/                # TypeScript types
│       ├── api-ape.d.ts
│       └── chrome.d.ts
│
├── public/
│   ├── icons/                # Extension icons
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── _locales/             # i18n
│
└── tests/
    ├── unit/
    └── e2e/
```

---

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "api-ape DevTools",
  "version": "1.0.0",
  "description": "Developer tools for api-ape WebSocket APIs",

  "permissions": [
    "activeTab",
    "storage",
    "webRequest",
    "scripting",
    "sidePanel",
    "devtools"
  ],

  "host_permissions": [
    "<all_urls>"
  ],

  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "side_panel": {
    "default_path": "sidepanel/index.html"
  },

  "devtools_page": "devtools/index.html",

  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/bridge.js"],
      "run_at": "document_start"
    }
  ],

  "web_accessible_resources": [
    {
      "resources": ["content/inject.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Manifest V3 configuration
- [ ] Basic popup with connection status
- [ ] Content script for page detection
- [ ] Background service worker
- [ ] Storage sync for settings
- [ ] Keyboard shortcuts infrastructure

### Phase 2: Core Features (Week 3-4)
- [ ] Endpoint tree component with auth indicators
- [ ] Pinned/favorites system
- [ ] Request builder with JSON editor
- [ ] Response viewer with syntax highlighting
- [ ] Request history with persistence
- [ ] Basic schema fetching from page
- [ ] Schema diff detection

### Phase 3: DevTools Integration (Week 5-6)
- [ ] DevTools panel registration
- [ ] Network request correlation
- [ ] WebSocket frame capture
- [ ] Console integration
- [ ] Performance metrics collection
- [ ] Activity stream with indicators

### Phase 4: Side Panel & Navigation (Week 7)
- [ ] Side panel entry point
- [ ] Tab navigation (6 tabs)
- [ ] Command palette (⌘K)
- [ ] Settings modal
- [ ] Responsive layout
- [ ] Panel persistence

### Phase 5: Advanced Features (Week 8-9)
- [ ] Type browser with view modes
- [ ] Endpoints grouped by return type
- [ ] Multi-language SDK generation
- [ ] Request collections (save/load)
- [ ] Export formats (cURL, Fetch, HAR, Postman)
- [ ] Request interception/mocking
- [ ] OpenAPI import/export

### Phase 6: Live Monitoring (Week 10)
- [ ] Multi-server connection management
- [ ] Health dashboard
- [ ] Connected clients analytics
- [ ] Alerts system with thresholds
- [ ] Channel monitoring
- [ ] Activity filtering

### Phase 7: Schema Design (Week 11)
- [ ] Visual schema canvas
- [ ] Endpoint editor with options
- [ ] Type editor with field management
- [ ] Compare mode (live vs local)
- [ ] Validation feedback
- [ ] Real-time updates

### Phase 8: AI Integration (Week 12)
- [ ] AI assistant UI
- [ ] Proactive suggestions
- [ ] Workflow templates
- [ ] Chat history with persistence
- [ ] Debug insights
- [ ] Test data generation
- [ ] Request flow builder

### Phase 9: Polish (Week 13-14)
- [ ] Full keyboard shortcuts
- [ ] Theming (light/dark/system)
- [ ] Performance optimization
- [ ] Error handling
- [ ] Documentation
- [ ] Onboarding flow

### Phase 10: Launch (Week 15)
- [ ] Chrome Web Store submission
- [ ] Firefox Add-ons submission
- [ ] Edge Add-ons submission
- [ ] Marketing page
- [ ] Video tutorials
- [ ] Gamification system (v2)

---

## Key Differences from VS Code Extension

| Feature | VS Code | Browser Extension |
|---------|---------|-------------------|
| Authentication | Manual config | Automatic (cookies) |
| Request execution | fetch() | Page context or fetch |
| WebSocket | New connection | Observe existing |
| Schema source | LSP server | Page injection |
| File generation | Write to disk | Download file |
| Mock server | External | Request interception |
| Network inspection | Limited | Full DevTools access |
| Real-time updates | Polling | Event listeners |

---

## Security Considerations

1. **Content Security Policy** - Respect page CSP
2. **Permission scoping** - Only request necessary permissions
3. **Data isolation** - Don't leak data between tabs
4. **Secure storage** - Encrypt sensitive data
5. **Origin validation** - Verify api-ape endpoints
6. **No eval()** - Use safe code execution methods

---

## Success Metrics

- **Install rate** - Target: 10k installs in 6 months
- **Daily active users** - Target: 30% of installs
- **Retention** - Target: 60% 7-day retention
- **Rating** - Target: 4.5+ stars
- **Support tickets** - Target: <2% of users

---

## Open Questions

1. **Pricing model** - Free with premium features?
2. **Sync across browsers** - Cloud sync for settings/history?
3. **Team features** - Shared schemas, collections?
4. **Offline mode** - Work without server connection?
5. **Mobile** - Responsive for mobile DevTools?

---

## Next Steps

1. Create GitHub repository
2. Set up Vite + React project
3. Configure manifest.json
4. Implement basic popup
5. Add content script for page detection
6. Build request builder component
7. Test on sample api-ape application

---

## Appendix A: Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `⌘,` / `Ctrl+,` | Open Settings |
| `⌘R` / `Ctrl+R` | Refresh Schema |
| `⌘⇧P` / `Ctrl+Shift+P` | Toggle Side Panel |
| `Esc` | Close modal/palette |

### Endpoints Tab

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate endpoints |
| `Enter` | Test selected endpoint |
| `⌘Enter` | Quick test (inline) |
| `⌘C` / `Ctrl+C` | Copy API call |
| `P` | Pin/unpin endpoint |
| `/` | Focus search |

### Test Tab

| Shortcut | Action |
|----------|--------|
| `⌘Enter` | Execute request |
| `⌘S` / `Ctrl+S` | Save request |
| `⌘⇧C` / `Ctrl+Shift+C` | Copy as cURL |
| `⌘⇧F` / `Ctrl+Shift+F` | Copy as Fetch |
| `⌘L` / `Ctrl+L` | Clear response |

### Types Tab

| Shortcut | Action |
|----------|--------|
| `⌘G` / `Ctrl+G` | Generate SDK |
| `⌘C` / `Ctrl+C` | Copy type definition |
| `⌘D` / `Ctrl+D` | Download .d.ts |

### Live Tab

| Shortcut | Action |
|----------|--------|
| `Space` | Pause/resume stream |
| `⌘F` / `Ctrl+F` | Filter activity |
| `⌘E` / `Ctrl+E` | Export HAR |
| `C` | Clear activity log |

### Design Tab

| Shortcut | Action |
|----------|--------|
| `⌘S` / `Ctrl+S` | Save changes |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Shift+Z` | Redo |
| `+` | Add new endpoint |
| `Delete` | Delete selected |

### AI Tab

| Shortcut | Action |
|----------|--------|
| `/` | Focus chat input |
| `Enter` | Send message |
| `⌘⇧C` / `Ctrl+Shift+C` | Clear chat history |
