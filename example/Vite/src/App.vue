<script setup lang="ts">
/**
 * 🦍 api-ape Vue Chat Example
 * 
 * This component demonstrates how to use api-ape in a Vue application:
 * 
 * 1. **Client Initialization**: Connect to api-ape WebSocket server
 * 2. **Proxy Pattern**: Use `client.sender` as a Proxy to call server functions
 * 3. **Event Listeners**: Listen for server broadcasts using `setOnReceiver`
 * 4. **Promise-based Calls**: Server functions return Promises automatically
 */

import { ref, onMounted } from 'vue'
import { getApeClient } from '../ape/client'
import Info from './components/Info.vue'

interface Message {
  user: string
  text: string
  time: string
}

// Component state
const messages = ref<Message[]>([])
const input = ref('')
const username = ref('')
const joined = ref(false)
const userCount = ref(0)
const sending = ref(false)
const connectionState = ref<'disconnected' | 'connecting' | 'connected'>('connecting')

// Store the api-ape sender Proxy
let api: any = null

onMounted(async () => {
  const client = await getApeClient()
  if (!client) return

  // Store the sender Proxy
  api = client.sender
  console.log('🦍 api-ape client connected')

  // Subscribe to connection state changes
  client.onConnectionChange((state: string) => {
    connectionState.value = state as any
  })

  // Set up event listeners for server broadcasts
  client.setOnReceiver('init', ({ data }: { data: { history: Message[], users: number } }) => {
    messages.value = data.history || []
    userCount.value = data.users || 0
    console.log('🦍 Initialized with', data.history?.length || 0, 'messages')
  })

  client.setOnReceiver('message', ({ data }: { data: { message: Message } }) => {
    messages.value.push(data.message)
  })

  client.setOnReceiver('users', ({ data }: { data: { count: number } }) => {
    userCount.value = data.count
  })
})

async function sendMessage() {
  if (!input.value.trim() || !api || sending.value) return

  sending.value = true

  try {
    const response = await api.message({ user: username.value, text: input.value })
    if (response?.message) {
      messages.value.push(response.message)
    }
  } catch (err) {
    console.error('Send failed:', err)
  } finally {
    sending.value = false
  }

  input.value = ''
}

function handleJoin() {
  if (username.value.trim()) {
    joined.value = true
  }
}

function formatTime(time: string) {
  return new Date(time).toLocaleTimeString()
}

function getConnectionStatus() {
  if (connectionState.value === 'connected') {
    if (userCount.value === 1) return '✅ Connected • Only You are online'
    if (userCount.value > 1) return `✅ Connected • You + ${userCount.value - 1} are online`
    return '✅ Connected'
  }
  if (connectionState.value === 'connecting') return '⏳ Connecting...'
  return '❌ Disconnected'
}
</script>

<template>
  <div class="container">
    <main class="main">
      <h1 class="title">
        🦍 <span class="gradient">api-ape</span> Chat
      </h1>
      <p class="subtitle">{{ getConnectionStatus() }}</p>

      <!-- Join Form -->
      <form v-if="!joined" @submit.prevent="handleJoin" class="join-form">
        <input
          type="text"
          placeholder="Enter your name..."
          v-model="username"
          class="input"
          autofocus
        />
        <button 
          type="submit" 
          class="button" 
          :disabled="connectionState !== 'connected'"
        >
          {{ connectionState === 'connected' ? 'Join Chat →' : 'Connecting...' }}
        </button>
      </form>

      <!-- Chat Interface -->
      <div v-else class="chat-container">
        <div class="header">
          <span>💬 {{ username }}</span>
          <span class="user-count">🟢 {{ userCount }} online</span>
        </div>

        <div class="messages">
          <p v-if="messages.length === 0" class="empty-state">
            No messages yet. Say hi! 👋
          </p>
          <div
            v-for="(msg, i) in messages"
            :key="i"
            :class="['message', msg.user === username ? 'my-message' : '']"
          >
            <strong class="username">{{ msg.user }}</strong>
            <span>{{ msg.text }}</span>
            <span class="time">{{ formatTime(msg.time) }}</span>
          </div>
        </div>

        <form @submit.prevent="sendMessage" class="input-form">
          <input
            type="text"
            placeholder="Type a message..."
            v-model="input"
            class="message-input"
            :disabled="sending"
            autofocus
          />
          <button type="submit" class="send-button" :disabled="sending">
            {{ sending ? '...' : 'Send' }}
          </button>
        </form>
      </div>

      <Info />
    </main>
  </div>
</template>
