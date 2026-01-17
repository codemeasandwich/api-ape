# 🦍 api-ape Examples

Complete working examples demonstrating api-ape usage.

## Examples

| Example | Description | Complexity |
|---------|-------------|------------|
| [ExpressJs/](./ExpressJs/) | Basic real-time chat | Minimal setup |
| [NextJs/](./NextJs/) | Full-featured chat app | Production-ready |
| [Bun/](./Bun/) | Bun + Vue (CDN) | Minimal setup |
| [Vite/](./Vite/) | Vite + Vue + TypeScript | Modern tooling |

---

## ExpressJs — Basic Example

A minimal real-time chat demonstrating core api-ape concepts.

**Features:**
- Simple Express.js server with api-ape
- Broadcast messages to other clients
- Message history

**Quick Start:**
```bash
cd ExpressJs
npm install
npm start
```

**Key Files:**
- `backend.js` — Server setup (22 lines)
- `api/message.js` — Message handler using `this.clients`
- `index.html` — Browser client using `window.ape`

---

## NextJs — Complete Example

A production-ready chat application with Next.js integration.

**Features:**
- Custom Next.js server with api-ape
- React hooks integration
- User presence tracking
- Docker support
- Connection lifecycle hooks

**Quick Start:**
```bash
cd NextJs
npm install
npm run dev
```

**Or with Docker:**
```bash
cd NextJs
docker-compose up --build
```

**Key Files:**
- `server.js` — Custom Next.js server with api-ape
- `api/message.js` — Message controller with validation
- `ape/client.js` — React client wrapper
- `ape/onConnect.js` — Connection lifecycle hooks
- `pages/index.tsx` — Chat UI with React hooks

---

## Bun — Vue CDN Example

A lightweight Bun server with Vue 3 via CDN — no build step required.

**Features:**
- Bun runtime (TypeScript native)
- Vue 3 Composition API
- Single HTML file frontend

**Quick Start:**
```bash
cd Bun
bun install
bun run server.ts
```

**Key Files:**
- `server.ts` — Bun HTTP server with api-ape
- `index.html` — Vue 3 app via CDN
- `api/message.js` — Message handler

---

## Vite — Vue + TypeScript Example

A modern Vite + Vue 3 frontend with Bun backend.

**Features:**
- Vue 3 with TypeScript
- Vite dev server with HMR
- Component-based architecture
- Production build support

**Quick Start:**
```bash
cd Vite
npm install
npm run dev        # Backend on :3000
npm run dev:vue    # Frontend on :5173
```

**Key Files:**
- `server.ts` — Bun backend server
- `src/App.vue` — Main Vue component
- `vite.config.ts` — Vite config with API proxy

