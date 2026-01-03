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
│   ├── index.js          # Ape exports
│   ├── client.js         # Browser client wrapper
│   ├── onConnect.js      # Connection lifecycle
│   ├── onDisconnect.js   # Disconnect handler
│   ├── onReceive.js      # Message logging
│   ├── onSend.js         # Send logging
│   ├── onError.js        # Error handling
│   └── embed.js          # Embedded context values
├── pages/
│   └── index.tsx         # Chat UI
└── styles/
    └── Chat.module.css   # Chat styling
```

## Features

- **Custom Server** — Express + Next.js with api-ape integration
- **Connection Lifecycle** — onConnect, onDisconnect, onReceive, onSend hooks
- **User Presence** — Track online users count
- **Message History** — New users receive chat history
- **React Integration** — Hooks-based client usage
- **Docker Support** — Production-ready containerization

## How It Works

### Server (server.js)

```js
const express = require('express')
const next = require('next')
const ape = require('api-ape')
const { onConnect } = require('./ape/onConnect')

const app = next({ dev: true })
const server = express()

ape(server, { where: 'api', onConnent: onConnect })
server.all('*', app.getRequestHandler())
server.listen(3000)
```

### Connection Lifecycle (ape/onConnect.js)

```js
module.exports.onConnect = (socket, req, send) => ({
  embed: { userId: generateId() },
  onReceive: (queryId, data, type) => { ... },
  onSend: (data, type) => { ... },
  onDisconnent: () => { ... }
})
```

### React Client (pages/index.tsx)

```bash
npm i api-ape
```

```jsx
import ape from 'api-ape'

// Configure and connect
ape.configure({ port: 3000 })
const { sender, setOnReciver } = ape()
ape.autoReconnect()

useEffect(() => {
  setOnReciver('message', ({ data }) => {
    setMessages(prev => [...prev, data.message])
  })
}, [])

// Send message
sender.message({ user, text }).then(response => { ... })
```

## Key Concepts Demonstrated

| Concept | File |
|---------|------|
| Custom Next.js server | `server.js` |
| Connection lifecycle hooks | `ape/onConnect.js` |
| Embedded context values | `ape/embed.js` |
| React hooks integration | `pages/index.tsx` |
| Client wrapper | `ape/client.js` |
| Message validation | `api/message.js` |
