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
├── backend.js        # Express server with api-ape
├── api/
│   ├── message.js    # Broadcast to other clients
│   └── history.js    # Get message history
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

const app = express()
ape(app, { where: 'api' })  // Load controllers from ./api

app.get('/', (req, res) => res.sendFile('index.html'))
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
  // Send message
  ape.message({ text: 'Hello!' })
  
  // Receive broadcasts
  ape.on('message', ({ data }) => console.log(data))
</script>
```

## Key Concepts Demonstrated

| Concept | Example |
|---------|---------|
| Auto-wiring | `ape(app, { where: 'api' })` loads `api/*.js` |
| Server call | `ape.message(data)` → calls `api/message.js` |
| Broadcast | `this.broadcastOthers('message', data)` |
| Listen | `ape.on('message', handler)` |
