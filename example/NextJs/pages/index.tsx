/**
 * 🦍 api-ape Next.js Chat Example
 * 
 * This component demonstrates how to use api-ape in a React/Next.js application:
 * 
 * 1. **Unified Import**: Just `import api from 'api-ape'` - no async setup!
 * 2. **Proxy Pattern**: Use `api.message()` to call server functions
 * 3. **Event Listeners**: Listen for server broadcasts using `api.on()`
 * 4. **Promise-based Calls**: Server functions return Promises automatically
 * 
 * Server-side: api/message.js handles incoming messages and broadcasts to other clients
 * Client-side: This component sends messages and receives broadcasts
 * 
 * Key api-ape concepts:
 * - `api` is a Proxy - accessing `api.message()` calls server function
 * - Property name (`message`) maps to server file: `api/message.js`
 * - `api.on(type, handler)` listens for server broadcasts
 * - All calls return Promises - server response is automatically matched by queryId
 * - Calls are buffered until the connection is ready - no need for getApeClient().then()!
 */

import Head from 'next/head'
import { useState, useEffect } from 'react'
import styles from '../styles/Chat.module.css'
import api from 'api-ape'
import Info from './Info'

export default function Home() {
  // Component state
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [username, setUsername] = useState('')
  const [joined, setJoined] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [connectionState, setConnectionState] = useState('connecting')

  /**
   * Set up api-ape event listeners on component mount
   * 
   * With the unified import, no need for getApeClient().then()!
   * The api object automatically buffers calls until connected.
   */
  useEffect(() => {
    // Skip on server-side rendering
    if (typeof window === 'undefined') return

    /**
     * Subscribe to connection state changes
     * 
     * `api.onConnectionChange` gets called with the current state immediately,
     * then on each state transition.
     * States: 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
     */
    const unsubscribe = api.onConnectionChange(setConnectionState)

    /**
     * Set up event listeners for server broadcasts
     * 
     * `api.on(type, handler)` listens for broadcasts from the server.
     * The server can broadcast using `this.broadcast()` or `this.broadcastOthers()`
     * in controller functions (see api/message.js).
     * 
     * Broadcast types:
     * - 'init': Initial data when client connects (history, user count)
     * - 'message': New message from another client
     * - 'users': Updated user count
     */
    api.on('init', ({ data }) => {
      // Server sent initial data (happens on connect)
      setMessages(data.history || [])
      setUserCount(data.users || 0)
      console.log('🦍 Initialized with', data.history?.length || 0, 'messages')
    })

    api.on('message', ({ data }) => {
      // Server broadcasted a new message from another client
      setMessages(prev => [...prev, data.message])
    })

    api.on('users', ({ data }) => {
      // Server broadcasted updated user count
      setUserCount(data.count)
    })

    return () => unsubscribe()
  }, [])

  /**
   * Send a message to the server
   * 
   * This demonstrates the api-ape Proxy pattern:
   * 
   * 1. Access `api.message()` - the property name 'message' maps to `api/message.js`
   * 2. Call it with data - returns a Promise
   * 3. Server processes the request in `api/message.js`
   * 4. Server can:
   *    - Return a value (fulfills the Promise)
   *    - Broadcast to other clients using `this.broadcastOthers()`
   *    - Throw an error (rejects the Promise)
   * 
   * The Promise resolves with whatever the server function returns.
   * The server also broadcasts to other clients (see api/message.js).
   */
  const sendMessage = (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    setSending(true)

    /**
     * Call server function using Proxy pattern
     * 
     * `api.message({ user, text })`
     * - Calls the `message` function in `api/message.js`
     * - Sends `{ user, text }` as the function argument
     * - Returns a Promise that resolves with the server's return value
     * - Server automatically broadcasts to other clients (see api/message.js)
     * - Calls are buffered until connected - no need to check connection status!
     * 
     * The server function receives the data and can:
     * - Validate input
     * - Store the message
     * - Broadcast to others: `this.broadcastOthers('message', { message: msg })`
     * - Return a response: `return { ok: true, message: msg }`
     */
    api.message({ user: username, text: input })
      .then((response) => {
        /**
         * Server responded successfully
         * 
         * The response is whatever the server function returned.
         * In this case, api/message.js returns: `{ ok: true, message: msg }`
         * 
         * Note: Other clients receive the message via broadcast (api.on above),
         * but we add it here from the server's response to show it immediately.
         */
        if (response?.message) {
          setMessages(prev => [...prev, response.message])
        }
        setSending(false)
      })
      .catch((err) => {
        /**
         * Server function threw an error or connection failed
         * 
         * Errors from server functions are automatically caught and
         * the Promise is rejected with the error.
         */
        console.error('Send failed:', err)
        setSending(false)
      })

    setInput('')
  }

  /**
   * Handle user joining the chat
   * Simply sets the joined state to show the chat interface
   */
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
          {connectionState === 'connected' ? (
            userCount === 1
              ? '✅ Connected • Only You are online'
              : userCount > 1
                ? `✅ Connected • You + ${userCount - 1} are online`
                : '✅ Connected'
          ) : connectionState === 'connecting'
            ? '⏳ Connecting...'
            : connectionState === 'offline'
              ? '📴 Offline • No internet connection'
              : connectionState === 'walled'
                ? '🚧 Captive Portal • Please complete WiFi login'
                : '❌ Disconnected'}
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
            <button type="submit" className={styles.button} disabled={connectionState !== 'connected'}>
              {connectionState === 'connected' ? 'Join Chat →'
                : connectionState === 'offline' ? 'Offline...'
                  : connectionState === 'walled' ? 'WiFi Login Required...'
                    : 'Connecting...'}
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

        <Info />
      </main>
    </div>
  )
}
