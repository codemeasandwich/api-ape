# api-ape Vite + Vue Example

A modern Vue 3 + Vite frontend with api-ape, demonstrating real-time chat using the **Vite plugin**.

## Quick Start

```bash
# Install dependencies
npm install

# Start development (single command!)
npm run dev
```

Open http://localhost:5173 in multiple tabs to test the chat.

## Project Structure

```
Vite/
├── src/
│   ├── App.vue              # Main chat component
│   ├── main.ts              # Vue app entry
│   ├── style.css            # Styles
│   └── components/
│       └── Info.vue         # How api-ape works explanation
├── ape/
│   └── onConnect.ts         # Connection lifecycle hooks
├── api/
│   └── message.ts           # Message handler with broadcastOthers
├── vite.config.ts           # Vite config with api-ape plugin
├── server.ts                # Production server (for deployment)
└── package.json
```

## Vite Plugin

This example uses the `api-ape/vite` plugin for seamless integration:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import apiApe from 'api-ape/vite'

export default defineConfig({
  plugins: [
    vue(),
    apiApe({
      where: 'api',                    // Controllers directory
      onConnect: './ape/onConnect'     // Connection handler (supports TS)
    })
  ]
})
```

**Benefits:**
- Single `npm run dev` command (no separate backend process)
- No proxy configuration needed
- WebSocket runs directly on Vite's dev server
- TypeScript support for `onConnect` handler

## Production

For production, use the standalone server:

```bash
# Build Vue app
npm run build

# Run production server
NODE_ENV=production npm start
```

The production server (`server.ts`) serves the built Vue app from `dist/` and handles api-ape WebSocket connections.

## Features

- Vue 3 Composition API with TypeScript
- Vite for instant HMR
- api-ape Vite plugin (dev mode)
- Join form before entering chat
- Live user count
- Message timestamps
- Connection state management
