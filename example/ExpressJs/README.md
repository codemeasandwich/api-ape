# 🦍 ExpressJs — Basic Example

A minimal real-time chat app demonstrating api-ape core concepts.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in multiple browser windows.

## Project Structure

```
ExpressJs/
├── backend.js        # Express server with api-ape + onConnect hook
├── api/
│   └── message.js    # Broadcast to other clients
├── index.html        # Chat UI
└── styles.css        # Styling
```

## How It Works

### Server (backend.js)

```bash
npm i api-ape
```

```js
const express = require('express')
const ape = require('api-ape')
const { online, broadcast } = require('api-ape/server/lib/broadcast')

const app = express()

ape(app, {
  where: 'api',
  onConnent: (socket, req, send) => {
    // Push history + user count on connect
    const { _messages } = require('./api/message')
    send('init', { history: _messages, users: online() })
    broadcast('users', { count: online() })

    return {
      onDisconnent: () => broadcast('users', { count: online() })
    }
  }
})

app.listen(3000)
```

### Controller (api/message.js)

```js
module.exports = function (data) {
    this.broadcastOthers('message', data)  // Send to other clients
    return data                             // Reply to sender
}
```

### Client (index.html)

```html
<script src="/api/ape.js"></script>
<script>
  // Receive init on connect (pushed by server)
  ape.on('init', ({ data }) => {
    console.log('History:', data.history)
    console.log('Users online:', data.users)
  })
  
  // Listen for user count updates
  ape.on('users', ({ data }) => console.log('Online:', data.count))
  
  // Listen for messages
  ape.on('message', ({ data }) => console.log(data))
  
  // Send message
  ape.message({ text: 'Hello!' })
</script>
```

## Key Concepts Demonstrated

| Concept | Example |
|---------|---------|
| Auto-wiring | `ape(app, { where: 'api' })` loads `api/*.js` |
| onConnect hook | `onConnent: (socket, req, send) => { ... }` |
| Push on connect | `send('init', { history, users })` |
| Broadcast all | `broadcast('users', { count })` |
| Broadcast others | `this.broadcastOthers('message', data)` |
| Listen | `ape.on('init', handler)` |
