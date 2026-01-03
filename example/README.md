# 🦍 api-ape Examples

Complete working examples demonstrating api-ape usage.

## Examples

| Example | Description | Complexity |
|---------|-------------|------------|
| [ExpressJs/](./ExpressJs/) | Basic real-time chat | Minimal setup |
| [NextJs/](./NextJs/) | Full-featured chat app | Production-ready |

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
- `api/message.js` — Message handler with `this.broadcastOthers()`
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
