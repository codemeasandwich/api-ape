# api-ape Vite + Vue Example

A modern Vue 3 + Vite frontend with a Bun backend, demonstrating `api-ape` real-time chat.

Matches the NextJs example structure and features.

## Project Structure

```
Vite/
├── src/
│   ├── App.vue              # Main chat component
│   ├── main.ts              # Vue app entry
│   ├── style.css            # Styles
│   ├── vite-env.d.ts        # Vite TypeScript declarations
│   └── components/
│       └── Info.vue         # How api-ape works explanation
├── ape/
│   ├── client.ts            # api-ape client wrapper (singleton)
│   └── onConnect.ts         # Connection lifecycle hooks
├── api/
│   └── message.ts           # Message handler with broadcastOthers
├── index.html               # HTML entry point
├── server.ts                # Bun backend server
├── vite.config.ts           # Vite config with proxy
└── package.json
```

## Quick Start

```bash
# Install dependencies
npm install

# Terminal 1: Start backend
npm run dev

# Terminal 2: Start Vue frontend
npm run dev:vue
```

Open http://localhost:5173 in multiple tabs to test the chat.

## Production Build

```bash
# Build Vue app
npm run build

# Run backend in production mode
NODE_ENV=production npm run dev
```

## How It Works

- **Development**: Vite runs on `:5173` with a proxy forwarding `/api` requests to the Bun server on `:3000`
- **Production**: Bun serves the built Vue app from `dist/`
- **api-ape**: Handles WebSocket connections for real-time messaging

## Features

- 🚀 Vue 3 Composition API with TypeScript
- ⚡ Vite for instant HMR
- 🦍 api-ape for WebSocket communication
- 🥖 Bun for fast backend runtime
- 👤 Join form before entering chat
- 📊 Connection state management
- 👥 Live user count
- ⏰ Message timestamps
- 📚 Info panel explaining api-ape concepts
