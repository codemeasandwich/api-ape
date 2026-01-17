<script setup lang="ts">
/**
 * Info component - explains how api-ape works
 */
</script>

<template>
  <div class="code-section">
    <h3 class="code-title">📚 How api-ape Works</h3>
    
    <div class="grid-container">
      <div class="grid-layout">
        <!-- Top Left: Key Concepts -->
        <div>
          <h4 class="section-heading">💡 Key Concepts</h4>
          <pre class="code">• Proxy Pattern: api.message() → api/message.js
• Auto-wiring: Drop files in api/ folder, they become endpoints
• Promises: All calls return Promises automatically
• Pub/Sub: Use ape.publish.channel(data) for channel subscribers
• Context: this.clients, this.clientId, this.req available in controllers
• Auto-reconnect: Client reconnects automatically on disconnect</pre>
        </div>

        <!-- Top Right: Data Flow -->
        <div>
          <h4 class="section-heading-large">🔄 Data Flow</h4>
          <div class="data-flow-grid">
            <!-- Column Headers -->
            <div class="column-header-client">Client</div>
            <div class="grid-cell"></div>
            <div class="column-header-server">Server</div>

            <!-- Step 1: Client sends -->
            <div class="client-box-span3">api.message(data)</div>
            <div class="arrow-container-row2">
              <div class="arrow-line-send"></div>
              <span class="arrow-label-blue">Send</span>
              <div class="arrow-head-right"></div>
            </div>
            <div class="empty-grid-cell"></div>

            <!-- Step 2: Server receives -->
            <div class="empty-grid-cell-row3"></div>
            <div class="arrow-container-row3">
              <div class="arrow-head-left"></div>
              <span class="arrow-label-green">Return</span>
              <div class="arrow-line-return"></div>
            </div>
            <div class="server-box-span2">api/message.js</div>

            <!-- Step 3: Server sends to others -->
            <div class="empty-grid-cell-row4"></div>
            <div class="arrow-container-row4">
              <div class="arrow-line-broadcast"></div>
              <span class="arrow-label-green">Send</span>
              <div class="arrow-head-right"></div>
            </div>
            <div class="server-box-span3">Send to others</div>

            <!-- Step 4: Other clients receive -->
            <div class="client-box-single">Other clients</div>
            <div class="arrow-container-row5">
              <div class="arrow-head-left-blue"></div>
              <span class="arrow-label-blue">Receive</span>
              <div class="arrow-line-broadcast-return"></div>
            </div>
            <div class="empty-grid-cell-row5"></div>
          </div>
        </div>

        <!-- Bottom Left: Client-Side -->
        <div>
          <h4 class="section-heading">🔵 Client-Side (Browser)</h4>
          <pre class="code">// 1. Initialize api-ape client
const client = await getApeClient()
const api = client.sender  // Proxy object

// 2. Call server function - property name = file path
//    api.message() → calls api/message.js
api.message({ user: 'Alice', text: 'Hello!' })
  .then(response => {
    // Server returned: { ok: true, message: {...} }
    console.log('Response:', response)
  })
  .catch(err => {
    // Server threw an error
    console.error('Error:', err)
  })

// 3. Listen for server messages
client.setOnReceiver('message', ({ data }) => {
  // Server sent to this client
  // This fires for clients the server sends to
  console.log('Message received:', data.message)
})</pre>
        </div>

        <!-- Bottom Right: Server-Side -->
        <div>
          <h4 class="section-heading">🟢 Server-Side (api/message.js)</h4>
          <pre class="code">// File: api/message.js
// This function is called when client does: api.message(data)

module.exports = function message(data) {
  const { user, text } = data

  // Validate input
  if (!user || !text) {
    throw new Error('Missing user or text')
  }

  const msg = {
    user,
    text,
    time: new Date().toISOString()
  }

  // Send to ALL OTHER clients (not the sender)
  this.clients.forEach((client) => {
    if (client.clientId !== this.clientId) {
      client.sendTo('message', { message: msg })
    }
  })

  // Return response to sender (fulfills Promise)
  return { ok: true, message: msg }
}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-section {
  margin-top: 2rem;
}

.code-title {
  margin-bottom: 0.5rem;
  color: #0f0;
}

.grid-container {
  max-width: 1200px;
  margin: 1.5rem auto 0;
  padding: 0 1rem;
  width: 100%;
  box-sizing: border-box;
}

.grid-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  width: 100%;
}

@media (min-width: 768px) {
  .grid-layout {
    grid-template-columns: 1fr 1fr;
  }
}

.section-heading {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  font-weight: bold;
}

.section-heading-large {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  font-weight: bold;
}

.code {
  background: rgba(0, 0, 0, 0.4);
  padding: 1.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  color: #0f0;
  overflow: auto;
  white-space: pre-wrap;
  font-family: monospace;
}

.data-flow-grid {
  display: grid;
  grid-template-columns: 200px 1fr 200px;
  grid-template-rows: auto auto auto auto auto;
  gap: 1rem;
  align-items: stretch;
}

.column-header-client {
  font-size: 0.8rem;
  font-weight: bold;
  text-align: center;
  grid-row: 1;
  grid-column: 1;
  color: #00d2ff;
}

.column-header-server {
  font-size: 0.8rem;
  font-weight: bold;
  text-align: center;
  grid-row: 1;
  grid-column: 3;
  color: #00e676;
}

.client-box-span3 {
  background: linear-gradient(135deg, #3a7bd5, #00d2ff);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(58, 123, 213, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 1;
  grid-row: 2 / 5;
}

.client-box-single {
  background: linear-gradient(135deg, #3a7bd5, #00d2ff);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(58, 123, 213, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 1;
  grid-row: 5;
}

.server-box-span2 {
  background: linear-gradient(135deg, #00c851, #00e676);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0, 200, 81, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 3;
  grid-row: 2 / 4;
}

.server-box-span3 {
  background: linear-gradient(135deg, #00c851, #00e676);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0, 200, 81, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 3;
  grid-row: 4 / 6;
}

.arrow-container-row2,
.arrow-container-row3,
.arrow-container-row4,
.arrow-container-row5 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  grid-column: 2;
}

.arrow-container-row2 { grid-row: 2; }
.arrow-container-row3 { grid-row: 3; }
.arrow-container-row4 { grid-row: 4; }
.arrow-container-row5 { grid-row: 5; }

.arrow-line-send {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, #00d2ff, #00e676);
}

.arrow-line-return {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, #00e676, transparent);
}

.arrow-line-broadcast {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00e676);
}

.arrow-line-broadcast-return {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, #00d2ff, transparent);
}

.arrow-label-blue {
  font-size: 0.7rem;
  white-space: nowrap;
  padding: 0 0.5rem;
  color: #00d2ff;
}

.arrow-label-green {
  font-size: 0.7rem;
  white-space: nowrap;
  padding: 0 0.5rem;
  color: #00e676;
}

.arrow-head-right {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 8px solid #00e676;
}

.arrow-head-left {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-right: 8px solid #00e676;
}

.arrow-head-left-blue {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-right: 8px solid #00d2ff;
}

.empty-grid-cell { grid-row: 2; grid-column: 3; }
.empty-grid-cell-row3 { grid-row: 3; grid-column: 1; }
.empty-grid-cell-row4 { grid-row: 4; grid-column: 1; }
.empty-grid-cell-row5 { grid-row: 5; grid-column: 3; }
</style>
