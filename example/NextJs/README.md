# 🦍 NextJs — Complete Example

A full-featured real-time chat application with Next.js and api-ape.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Docker

```bash
docker-compose up --build
```

## Project Structure

```
NextJs/
├── server.js             # Custom Next.js server with api-ape
├── api/
│   └── message.js        # Message controller
├── ape/
│   ├── index.js          # Ape module entry point
│   ├── client.js         # Client-side api-ape wrapper
│   ├── embed.js          # Embed values for controller context
│   ├── onConnect.js      # Connection lifecycle hook
│   ├── onDisconnect.js   # Disconnection handler
│   ├── onReceive.js      # Message receive handler
│   ├── onSend.js         # Message send handler
│   ├── onError.js        # Error handler
│   └── logic/
│       └── chat.js       # Chat utilities (history, etc.)
├── pages/
│   ├── _app.tsx          # Next.js app wrapper
│   ├── index.tsx         # Chat UI
│   └── Info.tsx          # Info panel component
├── styles/
│   ├── globals.css       # Global styles
│   ├── Home.module.css   # Home page styles
│   └── Chat.module.css   # Chat component styles
├── Dockerfile            # Production Docker image
├── Dockerfile.dev        # Development Docker image
├── docker-compose.yml    # Docker Compose config
├── next.config.js        # Next.js configuration
└── tsconfig.json         # TypeScript configuration
```

## Features

- **Custom Server** — Node.js http server + Next.js with api-ape
- **Connection Lifecycle** — onConnect, onDisconnect hooks
- **User Presence** — Track online users count
- **Message History** — New users receive chat history
- **React Integration** — Simple unified client API
- **Docker Support** — Production-ready containerization

## How It Works

### Server (server.js)

```js
const { createServer } = require('http')
const next = require('next')
const api = require('api-ape')           // Client proxy (for api.* calls)
const { ape } = require('api-ape')       // Server initializer
const { onConnect } = require('./ape/onConnect')

const app = next({ dev: true })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res))
  
  ape(server, { where: 'api', onConnect })
  
  server.listen(3000)
})
```

### Connection Lifecycle (ape/onConnect.js)

```js
const { ape } = require('api-ape')  // For ape.clients, ape.publish

module.exports.onConnect = (socket, req, send) => {
  // Send initial data to new client
  send('init', { history: messages, users: ape.clients.size })
  ape.publish.users({ count: ape.clients.size })

  return {
    onDisconnect: () => {
      ape.publish.users({ count: ape.clients.size })
    }
  }
}
```

### React Client (pages/index.tsx)

```jsx
import api from 'api-ape'

// Send message - just call the method!
await api.message({ user: 'Alice', text: 'Hello!' })

// Listen for messages
api.on('message', ({ data }) => {
  setMessages(prev => [...prev, data])
})

// Track connection state
api.onConnectionChange((state) => {
  console.log('Connection:', state)
})
```

## Key Concepts Demonstrated

| Concept | File |
|---------|------|
| Custom Next.js server | `server.js` |
| Connection lifecycle hooks | `ape/onConnect.js` |
| Chat message controller | `api/message.js` |
| React client integration | `pages/index.tsx` |
