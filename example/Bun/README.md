# 🦍 Bun — Example

A minimal real-time chat app using Bun's native HTTP server with api-ape.

## Quick Start

```bash
bun start
```

That's it! This single command installs dependencies, starts the type watcher for real-time IntelliSense, and launches the server.

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

## Type System Integration

This example includes api-ape's type system for real-time IntelliSense.

### Quick Start

```bash
bun install
bun run dev    # Starts type watcher + server concurrently
```

### VS Code Extension Setup

1. Open VS Code in the `type_system/vscode-api-ape` directory
2. Press `F5` to launch Extension Development Host
3. In the new window, open the `example/Bun` folder
4. Start the dev server: `bun run dev`
5. Open any TypeScript file and type `api.` to see IntelliSense

Alternatively, build and install the extension:
```bash
cd type_system/vscode-api-ape
npm install
npx vsce package
code --install-extension vscode-api-ape-1.0.0.vsix
```

### Real-Time Type Updates

The `dev` script runs the type watcher in the background:
- Edit `api/message.ts` → types regenerate automatically
- IntelliSense updates immediately in VS Code

### Scripts

| Script | Description |
|--------|-------------|
| `bun run start` | Install + dev (one command for everything) |
| `bun run dev` | Type watcher + server (real-time IntelliSense) |
| `bun run types` | Generate types once |
| `bun run types:watch` | Watch mode (regenerates on file change) |
| `bun run server` | Start server only (no type watching) |

### How It Works

1. **Types defined** in `api/message.ts` via JSDoc comments
2. **CLI watches** for changes and regenerates `.api-ape/api-ape.d.ts`
3. **VSCode extension** provides IntelliSense using the LSP
4. **Types update** as you edit controllers
