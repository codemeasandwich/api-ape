import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import styles from '../styles/Chat.module.css'
import { getApeClient } from '../ape/client'

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [username, setUsername] = useState('')
  const [joined, setJoined] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const messagesEndRef = useRef(null)
  const apiRef = useRef(null) // The sender proxy

  // Initialize api-ape client on mount (before join)
  useEffect(() => {
    if (typeof window === 'undefined') return

    getApeClient().then((client) => {
      if (!client) return

      // Store the sender proxy - ready to use!
      apiRef.current = client.sender
      setConnected(true)
      console.log('🦍 api-ape ready')

      // Set up message listeners
      client.setOnReciver('init', ({ data }) => {
        setMessages(data.history || [])
        setUserCount(data.users || 0)
        console.log('🦍 Initialized')
      })

      client.setOnReciver('message', ({ data }) => {
        setMessages(prev => [...prev, data.message])
      })

      client.setOnReciver('users', ({ data }) => {
        setUserCount(data.count)
      })
    })
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message using the proxy pattern
  // api.message(data) -> sends type="message" with data
  // Returns a Promise - server can reply with matching queryId
  const sendMessage = (e) => {
    e.preventDefault()
    if (!input.trim() || !apiRef.current || sending) return

    const api = apiRef.current

    setSending(true)

    // api.message({ user, text }) - "message" is the type!
    // createdAt is auto-added by client
    // queryId hash is auto-generated for request/response matching
    api.message({ user: username, text: input })
      .then((response) => {
        // Server replied with matching queryId
        // Add our own message to the list (we sent it, so we add it)
        if (response?.message) {
          setMessages(prev => [...prev, response.message])
        }
        setSending(false)
      })
      .catch((err) => {
        console.error('Send failed:', err)
        setSending(false)
      })

    setInput('')
  }

  const handleJoin = (e) => {
    e.preventDefault()
    if (username.trim()) {
      setJoined(true)
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>🦍 api-ape Chat</title>
        <meta name="description" content="Real-time WebSocket chat using api-ape" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          🦍 <span className={styles.gradient}>api-ape</span> Chat
        </h1>
        <p className={styles.subtitle}>
          {connected ? '✅ Connected' : '⏳ Connecting...'} • Pure WebSocket
        </p>

        {!joined ? (
          <form onSubmit={handleJoin} className={styles.joinForm}>
            <input
              type="text"
              placeholder="Enter your name..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              autoFocus
            />
            <button type="submit" className={styles.button} disabled={!connected}>
              {connected ? 'Join Chat →' : 'Connecting...'}
            </button>
          </form>
        ) : (
          <div className={styles.chatContainer}>
            <div className={styles.header}>
              <span>💬 {username}</span>
              <span className={styles.userCount}>
                🟢 {userCount} online
              </span>
            </div>

            <div className={styles.messages}>
              {messages.length === 0 && (
                <p className={styles.emptyState}>No messages yet. Say hi! 👋</p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`${styles.message} ${msg.user === username ? styles.myMessage : ''}`}
                >
                  <strong className={styles.username}>{msg.user}</strong>
                  <span>{msg.text}</span>
                  <span className={styles.time}>
                    {new Date(msg.time).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className={styles.inputForm}>
              <input
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className={styles.messageInput}
                disabled={sending}
                autoFocus
              />
              <button type="submit" className={styles.sendButton} disabled={sending}>
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </div>
        )}

        <div className={styles.codeSection}>
          <h3 className={styles.codeTitle}>✨ api-ape Proxy Pattern</h3>
          <pre className={styles.code}>
            {`// Sender is a Proxy - prop name = type
const api = client.sender

// Send with Promise - queryId auto-matched
setSending(true)
api.message({ user, text })
  .then(() => setSending(false))
  .catch(err => console.error(err))

// createdAt auto-added by client
// queryId hash matches request/response`}
          </pre>
        </div>
      </main>
    </div>
  )
}
