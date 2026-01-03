# 🦍 Bun — Example

A minimal real-time chat app using Bun's native HTTP server with api-ape.

## Quick Start

```bash
bun install
bun run start
```

Open http://localhost:3000 in multiple browser windows.

## Project Structure

```
Bun/
├── server.ts         # Bun server with api-ape (TypeScript)
├── api/
│   └── message.ts    # Broadcast to other clients
├── index.html        # Chat UI
└── styles.css        # Styling
```

## How It Works

### Server (server.js)

```js
const ape = require('api-ape')

const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/') {
      return new Response(Bun.file('./index.html'))
    }
    return new Response('Not Found', { status: 404 })
  }
})

// Pass Bun's server to api-ape
ape(server, {
  where: 'api',
  onConnent: (socket, req, send) => {
    send('init', { history: [], users: ape.online() })
    ape.broadcast('users', { count: ape.online() })
    
    return {
      onDisconnent: () => ape.broadcast('users', { count: ape.online() })
    }
  }
})
```

## Why Bun?

| Feature | Benefit |
|---------|---------|
| **No Express needed** | Bun has built-in HTTP server |
| **Fast startup** | Bun starts in milliseconds |
| **Native TypeScript** | No build step for TS files |
| **Smaller footprint** | Fewer dependencies |

## Key Concepts Demonstrated

| Concept | Example |
|---------|---------|
| Auto-wiring | `ape(server, { where: 'api' })` loads `api/*.js` |
| onConnect hook | `onConnent: (socket, req, send) => { ... }` |
| Push on connect | `send('init', { history, users })` |
| Broadcast all | `broadcast('users', { count })` |
| Broadcast others | `this.broadcastOthers('message', data)` |
