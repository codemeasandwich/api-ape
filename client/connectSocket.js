/**
 * Core client socket connection module for api-ape
 *
 * This module manages WebSocket connections with automatic fallback to HTTP streaming
 * when WebSocket connections fail or are blocked (e.g., by corporate firewalls).
 *
 * ## Connection Flow
 * 1. Attempts WebSocket connection first (preferred for low latency)
 * 2. Falls back to HTTP streaming if WebSocket fails within 4 seconds
 * 3. Periodically retries WebSocket even when using HTTP streaming
 * 4. Handles reconnection automatically when connections drop
 *
 * ## Transport Modes
 * - `websocket` - Real-time bidirectional WebSocket connection
 * - `polling` - HTTP streaming fallback (GET for receiving, POST for sending)
 * - `auto` - Automatically selects best transport (default)
 *
 * ## Binary Data Support
 * The module transparently handles binary data (ArrayBuffer, Blob) by:
 * - Converting binary payloads to HTTP uploads
 * - Hydrating responses with linked binary resources
 * - Supporting client-to-client file sharing
 *
 * @module client/connectSocket
 * @see {@link module:client/connection/state} for connection state management
 * @see {@link module:client/transports/streaming} for HTTP fallback transport
 *
 * @example
 * // Basic usage
 * import connectSocket from './connectSocket.js'
 *
 * const client = connectSocket()
 * connectSocket.autoReconnect()
 *
 * // Send messages
 * client.sender.chat({ message: 'Hello!' })
 *   .then(response => console.log(response))
 *
 * // Receive broadcasts
 * client.setOnReceiver('notification', (msg) => {
 *   console.log('Received:', msg.data)
 * })
 *
 * // Monitor connection state
 * client.onConnectionChange((state) => {
 *   console.log('Connection state:', state)
 * })
 */

import jss from "../utils/jss";
import { createStreamingTransport } from "./transports/streaming";
import {
  ConnectionState,
  notifyConnectionChange,
  onConnectionChange,
} from "./connection/state";
import {
  getSocketUrl,
  checkCaptivePortal,
  scheduleNetworkRetry,
  setupOnlineListeners,
  WS_RETRY_INTERVAL,
} from "./connection/network";
import {
  fetchLinkedResources,
  fetchSharedFiles,
} from "./connection/fileDownload";
import { wrap } from "./connection/proxy";
import { createWsSend, createSender } from "./connection/sender";

/**
 * Configured transport mode
 * @type {'auto'|'websocket'|'polling'}
 * @private
 */
let configuredTransport = "auto";

/**
 * Currently active transport type
 * @type {'websocket'|'polling'|null}
 * @private
 */
let currentTransport = null;

/**
 * HTTP streaming transport instance (created lazily)
 * @type {import('./transports/streaming').StreamingTransport|null}
 * @private
 */
let streamingTransport = null;

/**
 * Timer for periodic WebSocket retry attempts
 * @type {number|null}
 * @private
 */
let wsRetryTimer = null;

/**
 * Timeout before falling back to HTTP streaming (ms)
 * @constant {number}
 */
const WS_FALLBACK_TIMEOUT = 4000;

/**
 * Current WebSocket instance, or false if not connected
 * @type {WebSocket|false}
 * @private
 */
let __socket = false;

/**
 * Whether the connection is ready to send/receive messages
 * @type {boolean}
 * @private
 */
let ready = false;

/**
 * Map of pending query IDs to their response callbacks
 * Used to match responses to their original requests
 * @type {Object.<string, function(Error|null, any): void>}
 * @private
 */
const waitingOn = {};

/**
 * Queue of messages waiting to be sent when connection becomes ready
 * @type {Array<{type: string, data: any, resolve: function, reject: function, waiting: boolean, createdAt: number, timer: number}>}
 * @private
 */
let aWaitingSend = [];

/**
 * Array of universal message receivers (called for all message types)
 * @type {Array<function({err: any, type: string, data: any}): void>}
 * @private
 */
const receiverArray = [];

/**
 * Map of type-specific message receivers
 * @type {Object.<string, Array<function({err: any, type: string, data: any}): void>>}
 * @private
 */
const ofTypesOb = {};

/**
 * Whether auto-reconnect is enabled
 * @type {boolean}
 * @private
 */
let reconnect = false;

/**
 * WebSocket send function bound to current socket
 * @type {function(string, any, number, boolean=): Promise<any>}
 * @private
 */
const wsSend = createWsSend(() => __socket, waitingOn);

// Setup browser online/offline listeners on module load
if (typeof window !== "undefined") {
  setupOnlineListeners(attemptConnection);
}

/**
 * Process incoming message data to hydrate binary resources
 *
 * This function handles two types of binary data references:
 * - L-tagged: Binary data linked from server responses (fetchLinkedResources)
 * - F-tagged: Shared files from other clients (fetchSharedFiles)
 *
 * @param {any} data - Raw data from server message
 * @param {Error|null} err - Error from the message, if any
 * @returns {Promise<any>} Hydrated data with binary resources fetched
 * @private
 *
 * @example
 * // Server sends: { image<!L>: 'abc123' }
 * // After hydration: { image: ArrayBuffer }
 */
async function processIncomingData(data, err) {
  if (!data || err) return data;
  try {
    let result = await fetchLinkedResources(data);
    return await fetchSharedFiles(result);
  } catch (e) {
    console.error(`🦍 Failed to hydrate data:`, e);
    return data;
  }
}

/**
 * Dispatch a received message to all registered handlers
 *
 * Messages are delivered to:
 * 1. Type-specific handlers registered via setOnReceiver(type, handler)
 * 2. Universal handlers registered via setOnReceiver(handler)
 *
 * @param {string} type - Message type identifier
 * @param {Error|null} err - Error payload, if any
 * @param {any} data - Message data payload
 * @private
 */
function dispatchMessage(type, err, data) {
  if (ofTypesOb[type]) ofTypesOb[type].forEach((w) => w({ err, type, data }));
  receiverArray.forEach((w) => w({ err, type, data }));
}

/**
 * Flush all queued messages through the provided send function
 *
 * Called when connection becomes ready to send pending messages
 * that were queued while disconnected.
 *
 * @param {function(string, any, number): Promise<any>} sendFn - Send function to use
 * @private
 */
function flushWaitingMessages(sendFn) {
  aWaitingSend.forEach(
    ({ type, data, resolve, reject, waiting, createdAt, timer }) => {
      clearTimeout(timer);
      const result = sendFn(type, data, createdAt);
      if (waiting) result.then(resolve).catch(reject);
    },
  );
  aWaitingSend = [];
}

/**
 * Switch from WebSocket to HTTP streaming transport
 *
 * Creates the streaming transport if needed and sets up event handlers.
 * This is called when WebSocket connection fails or times out.
 *
 * @private
 */
function switchToStreaming() {
  console.log("🦍 Switching to HTTP streaming transport");
  currentTransport = "polling";

  if (!streamingTransport) {
    streamingTransport = createStreamingTransport();

    /**
     * Handle incoming messages from streaming transport
     * @param {{type: string, data: any, err: any}} msg - Parsed message
     */
    streamingTransport.onMessage = async (msg) => {
      const data = await processIncomingData(msg.data, msg.err);
      dispatchMessage(msg.type, msg.err, data);
    };

    /**
     * Handle streaming connection established
     */
    streamingTransport.onOpen = () => {
      ready = true;
      notifyConnectionChange(ConnectionState.Connected);
      flushWaitingMessages((t, d, c) => streamingTransport.send(t, d, c));
      startWsRetry();
    };

    /**
     * Handle streaming connection closed
     */
    streamingTransport.onClose = () => {
      ready = false;
      notifyConnectionChange(ConnectionState.Disconnected);
    };

    /**
     * Handle streaming transport errors
     * @param {Error} err - The error that occurred
     */
    streamingTransport.onError = (err) =>
      console.error("🦍 Streaming error:", err);
  }

  streamingTransport.connect();
}

/**
 * Start periodic WebSocket retry attempts
 *
 * When using HTTP streaming, periodically attempts to upgrade to WebSocket.
 * This allows the connection to upgrade when network conditions improve.
 *
 * @private
 */
function startWsRetry() {
  if (
    wsRetryTimer ||
    currentTransport !== "polling" ||
    configuredTransport === "polling"
  )
    return;
  wsRetryTimer = setInterval(() => {
    if (currentTransport !== "polling") {
      clearInterval(wsRetryTimer);
      wsRetryTimer = null;
      return;
    }
    tryWebSocket(true);
  }, WS_RETRY_INTERVAL);
}

/**
 * Attempt to establish a WebSocket connection
 *
 * @param {boolean} [isRetry=false] - Whether this is a retry attempt from HTTP streaming mode
 * @private
 *
 * @description
 * Connection flow:
 * 1. Creates WebSocket to server's /api/ape endpoint
 * 2. Sets up fallback timer (only on initial connection with auto transport)
 * 3. On success: marks ready, flushes queued messages
 * 4. On failure: falls back to HTTP streaming (if auto mode)
 * 5. On close: schedules reconnection if auto-reconnect enabled
 */
function tryWebSocket(isRetry = false) {
  const ws = new WebSocket(getSocketUrl());
  let fallbackTimer = null;

  // Set up fallback to HTTP streaming if WebSocket doesn't connect in time
  if (!isRetry && configuredTransport === "auto") {
    fallbackTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        switchToStreaming();
      }
    }, WS_FALLBACK_TIMEOUT);
  }

  /**
   * Handle WebSocket connection opened
   */
  ws.onopen = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);

    // If retrying from polling mode, close the streaming transport
    if (isRetry && currentTransport === "polling") {
      if (streamingTransport) streamingTransport.close();
      if (wsRetryTimer) {
        clearInterval(wsRetryTimer);
        wsRetryTimer = null;
      }
    }

    currentTransport = "websocket";
    __socket = ws;
    ready = true;
    notifyConnectionChange(ConnectionState.Connected);
    flushWaitingMessages(wsSend);
  };

  /**
   * Handle incoming WebSocket messages
   * @param {MessageEvent} event - WebSocket message event
   */
  ws.onmessage = async (event) => {
    const { err, type, queryId, data } = jss.parse(event.data);

    // Check if this is a response to a pending request
    if (queryId && waitingOn[queryId]) {
      const hydratedData = await processIncomingData(data, err);
      waitingOn[queryId](err, hydratedData);
      delete waitingOn[queryId];
      return;
    }

    // Otherwise dispatch as a broadcast/push message
    const processed = await processIncomingData(data, err);
    dispatchMessage(type, err, processed);
  };

  /**
   * Handle WebSocket errors
   * @param {Event} err - Error event
   */
  ws.onerror = (err) => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    // Fall back to streaming on initial connection failure
    if (!isRetry && configuredTransport === "auto" && !ready)
      switchToStreaming();
  };

  /**
   * Handle WebSocket connection closed
   */
  ws.onclose = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    __socket = false;
    ready = false;

    // Only handle reconnection if we were using WebSocket transport
    if (currentTransport === "websocket") {
      notifyConnectionChange(ConnectionState.Disconnected);
      setTimeout(() => reconnect && connectSocket(), 500);
    }
  };
}

/**
 * Attempt to establish a connection to the server
 *
 * This function orchestrates the connection process:
 * 1. Checks if browser is online
 * 2. Detects captive portals (hotel/airport WiFi login pages)
 * 3. Initiates appropriate transport based on configuration
 *
 * @async
 * @private
 */
async function attemptConnection() {
  // Check browser online status first
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    notifyConnectionChange(ConnectionState.Offline);
    return;
  }

  notifyConnectionChange(ConnectionState.Connecting);

  // Check for captive portal
  if ((await checkCaptivePortal()) === "walled") {
    notifyConnectionChange(ConnectionState.Walled);
    scheduleNetworkRetry(attemptConnection);
    return;
  }

  // Start appropriate transport
  configuredTransport === "polling" ? switchToStreaming() : tryWebSocket(false);
}

/**
 * Create the sender function with current connection state
 * @type {function(string, any): Promise<any>}
 * @private
 */
const sender = createSender(
  () => ready,
  () => wsSend,
  aWaitingSend,
  connectSocket,
);

/**
 * Initialize or retrieve the client connection
 *
 * This is the main entry point for establishing connections.
 * Calling it multiple times returns the same client interface.
 *
 * @returns {ClientInterface} Client interface with sender, receivers, and state management
 *
 * @example
 * const client = connectSocket()
 *
 * // Access proxied sender
 * client.sender.myEndpoint({ data: 'value' })
 *
 * // Subscribe to messages
 * client.setOnReceiver('eventType', handler)
 *
 * // Check current transport
 * console.log(client.transport) // 'websocket' or 'polling'
 */
function connectSocket() {
  // Return existing interface if already connected
  if (__socket && __socket.readyState !== WebSocket.CLOSED)
    return buildClientInterface();
  if (currentTransport === "polling" && streamingTransport?.isConnected())
    return buildClientInterface();

  // Otherwise initiate connection
  attemptConnection();
  return buildClientInterface();
}

/**
 * Build the public client interface object
 *
 * @returns {ClientInterface} The client interface
 * @private
 *
 * @typedef {Object} ClientInterface
 * @property {Proxy} sender - Proxied sender for calling server endpoints
 * @property {function(string|function, function=): void} setOnReceiver - Register message handlers
 * @property {function(function): function} onConnectionChange - Subscribe to connection state changes
 * @property {'websocket'|'polling'|null} transport - Current transport type (read-only)
 */
function buildClientInterface() {
  return {
    /**
     * Proxied sender object for calling server endpoints
     *
     * Properties accessed on this object are converted to API paths.
     *
     * @example
     * // Calls /chat endpoint
     * sender.chat({ message: 'Hi' })
     *
     * // Calls /users/123 endpoint
     * sender.users('/123', { action: 'get' })
     *
     * @type {Proxy}
     */
    sender: wrap(sender),

    /**
     * Register a message receiver/handler
     *
     * @param {string|function} onTypeStFn - Message type to listen for, or universal handler function
     * @param {function=} handlerFn - Handler function (if first arg is type string)
     *
     * @example
     * // Type-specific handler
     * client.setOnReceiver('notification', (msg) => {
     *   console.log('Got notification:', msg.data)
     * })
     *
     * // Universal handler (receives all messages)
     * client.setOnReceiver((msg) => {
     *   console.log('Got message:', msg.type, msg.data)
     * })
     */
    setOnReceiver: (onTypeStFn, handlerFn) => {
      if (typeof onTypeStFn === "string") {
        ofTypesOb[onTypeStFn] = [handlerFn];
      } else if (!receiverArray.includes(onTypeStFn)) {
        receiverArray.push(onTypeStFn);
      }
    },

    /**
     * Subscribe to connection state changes
     * @type {function(function(ConnectionStateValue): void): function(): void}
     */
    onConnectionChange,

    /**
     * Current transport type
     * @type {'websocket'|'polling'|null}
     * @readonly
     */
    get transport() {
      return currentTransport;
    },
  };
}

/**
 * Enable automatic reconnection on connection loss
 *
 * When enabled, the client will automatically attempt to reconnect
 * when the WebSocket connection is closed unexpectedly.
 *
 * @static
 * @memberof connectSocket
 *
 * @example
 * connectSocket.autoReconnect()
 */
connectSocket.autoReconnect = () => (reconnect = true);

/**
 * Connection state enum reference
 *
 * @static
 * @memberof connectSocket
 * @type {typeof ConnectionState}
 *
 * @example
 * client.onConnectionChange((state) => {
 *   if (state === connectSocket.ConnectionState.Connected) {
 *     console.log('Connected!')
 *   }
 * })
 */
connectSocket.ConnectionState = ConnectionState;

export default connectSocket;
export { ConnectionState };
