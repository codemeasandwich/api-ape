import styles from '../styles/Chat.module.css'

export default function Info() {
  return (
    <div className={styles.codeSection}>
      <h3 className={styles.codeTitle}>📚 How api-ape Works</h3>
      
      <div className={styles.gridContainer}>
        <div className={styles.gridLayout}>
          {/* Top Left: Key Concepts */}
          <div>
            <h4 className={styles.sectionHeading}>
              💡 Key Concepts
            </h4>
            <pre className={styles.code}>
              {`• Proxy Pattern: api.message() → api/message.js
• Auto-wiring: Drop files in api/ folder, they become endpoints
• Promises: All calls return Promises automatically
• Broadcasts: Use this.broadcast() or this.broadcastOthers()
• Context: this.broadcast, this.hostId, this.req available in controllers
• Auto-reconnect: Client reconnects automatically on disconnect`}
            </pre>
          </div>

          {/* Top Right: Data Flow */}
          <div>
            <h4 className={styles.sectionHeadingLarge}>
              🔄 Data Flow
            </h4>
            <div className={styles.dataFlowGrid}>
              {/* Column Headers */}
              <div className={styles.columnHeaderClient}>
                Client
              </div>
              <div className={styles.gridCell}></div>
              <div className={styles.columnHeaderServer}>
                Server
              </div>

              {/* Step 1: Client sends */}
              <div className={styles.clientBoxSpan3}>
                api.message(data)
              </div>
              <div className={styles.arrowContainerRow2}>
                <div className={styles.arrowLineSend}></div>
                <span className={styles.arrowLabelBlue}>Send</span>
                <div className={styles.arrowHeadRight}></div>
              </div>
              <div className={styles.emptyGridCell}></div>

              {/* Step 2: Server receives */}
              <div className={styles.emptyGridCellRow3}></div>
              <div className={styles.arrowContainerRow3}>
                <div className={styles.arrowHeadLeft}></div>
                <span className={styles.arrowLabelGreen}>Return</span>
                <div className={styles.arrowLineReturn}></div>
              </div>
              <div className={styles.serverBoxSpan2}>
                api/message.js
              </div>

              {/* Step 3: Server broadcasts */}
              <div className={styles.emptyGridCellRow4}></div>
              <div className={styles.arrowContainerRow4}>
                <div className={styles.arrowLineBroadcast}></div>
                <span className={styles.arrowLabelGreen}>Broadcast</span>
                <div className={styles.arrowHeadRight}></div>
              </div>
              <div className={styles.serverBoxSpan3}>
                Broadcast to others
              </div>

              {/* Step 4: Other clients receive */}
              <div className={styles.clientBoxSingle}>
                Other clients
              </div>
              <div className={styles.arrowContainerRow5}>
                <div className={styles.arrowHeadLeftBlue}></div>
                <span className={styles.arrowLabelBlue}>Broadcast</span>
                <div className={styles.arrowLineBroadcastReturn}></div>
              </div>
              <div className={styles.emptyGridCellRow5}></div>

            </div>
          </div>

          {/* Bottom Left: Client-Side */}
          <div>
            <h4 className={styles.sectionHeading}>
              🔵 Client-Side (Browser)
            </h4>
            <pre className={styles.code}>
              {`// 1. Initialize api-ape client
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

// 3. Listen for server broadcasts
client.setOnReciver('message', ({ data }) => {
  // Server called: this.broadcastOthers('message', data)
  // This fires for ALL clients except the sender
  console.log('Broadcast received:', data.message)
})`}
            </pre>
          </div>

          {/* Bottom Right: Server-Side */}
          <div>
            <h4 className={styles.sectionHeading}>
              🟢 Server-Side (api/message.js)
            </h4>
            <pre className={styles.code}>
              {`// File: api/message.js
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
  
  // Broadcast to ALL OTHER clients (not the sender)
  this.broadcastOthers('message', { message: msg })
  
  // Return response to sender (fulfills Promise)
  return { ok: true, message: msg }
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
