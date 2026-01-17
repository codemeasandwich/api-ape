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
├── styles.css        # Styling
├── tsconfig.json     # TypeScript configuration
└── package.json      # Dependencies
```

## How It Works

### Server (server.ts)

Uses the **same unified signature** as Node.js/Express:

```ts
const { ape } = require('api-ape')  // Server initializer (named export)

// Create Bun server
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    // Your static files
    return new Response(Bun.file('./index.html'))
  },
  websocket: { message() {} }  // Placeholder - ape() replaces via server.reload()
})

// Same signature as Node.js/Express!
ape(server, {
  where: 'api',
  onConnect: (socket, req, send) => {
    send('init', { history: [], users: ape.clients.size })
    return { onDisconnect: () => ape.publish.users({ count: ape.clients.size }) }
  }
})
```

**api-ape automatically uses `server.reload()` to hook in handlers.**

## Why Bun?

| Feature | Benefit |
|---------|---------|
| **No Express needed** | Bun has built-in HTTP server |
| **Fast startup** | Bun starts in milliseconds |
| **Native TypeScript** | No build step for TS files |
| **Smaller footprint** | Fewer dependencies |
| **Native WebSocket** | Uses Bun.serve() built-in|

## Key Concepts Demonstrated

| Concept | Example |
|---------|---------|
| Auto-wiring | `ape(server, { where: 'api' })` loads `api/*.js` |
| onConnect hook | `onConnect: (socket, req, send) => { ... }` |
| Push on connect | `send('init', { history, users })` |
| Publish to channel | `ape.publish.users({ count })` |
| Send to specific clients | `this.clients.forEach(c => c.send(...))` |
