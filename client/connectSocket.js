/**
 * @fileoverview Core client socket connection module for api-ape
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
 *
 * ## Phase 1 logical reconnect (browser transport)
 *
 * - **`__connected__`** carries **`clientId`** (resume hint) and **`sessionId`** (cookie pairing).
 * - **Backoff** delays reconnect attempts via **`reconnectBackoff`** integration.
 * - **`waitingOn`** rejects in-flight RPC when the socket closes unexpectedly.
 * - **Streaming fallback** still flushes **`aWaitingSend`** once the polling transport opens.
 * - **Offline / captive portal** flows defer **`attemptConnection`** instead of tight looping.
 * - **Transport auto mode** applies **`WS_FALLBACK_TIMEOUT`** before switching to HTTP streaming.
 * - **Polling send path** preserves **`setSendFn`** + **`resubscribeAll`** parity after transport swaps.
 * - **RPC hydration** uses **`processIncomingData`** for linked binary/file payloads on both transports.
 * - **Subscription proxy** keeps **`wrap(sender)`** stable while transports churn underneath.
 * - **Logging** honors **`configureApeLogging`** when diagnostics are enabled from **`connectSocket(options)`**.
 * - **Network retries** delegate to **`scheduleNetworkRetry`** when browsers report offline/walled states.
 * - **Same-site session cookie** attributes balance local dev ergonomics with baseline CSRF posture (`SameSite=Lax`).
 * - **Queued RPC flush** runs through **`flushWaitingMessages`** whenever **`ready`** transitions true.
 *
 */

import jss from "../utils/jss";
import { configureApeLogging } from "../utils/apeLogger.js";
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
} from "./connection/network";
import { reconnectDelayMs, pingRetryDelayMs } from "./connection/reconnectBackoff.js";
import { createConnectAttempt } from "./connection/connectAttempt.js";
import { wrap } from "./connection/proxy";
import { createWsSend, createSender, flushQueue } from "./connection/sender";
import { createStreamingFallback } from "./connection/streamingFallback.js";
import { setSendFn, resubscribeAll } from "./connection/subscriptions";
import {
  processIncomingData,
  dispatchMessage,
  setOnReceiver,
} from "./connection/messageHandler";

/**
 * Phase 1 companion notes (browser transport split across modules below).
 *
 * - **`getSocketUrl(lastResumeClientId)`** centralizes WS URL construction including **`resume=`**.
 * - **`createWsSend`** binds **`waitingOn`** so RPC rejects track socket lifetime accurately.
 * - **`createSender`** owns **`aWaitingSend`** queue semantics mirrored by streaming fallback.
 * - **`processIncomingData`** hydrates binary payloads before **`dispatchMessage`** fans out events.
 * - **`wrap`** ensures **`client.sender.*`** RPC mirrors remain ergonomic for apps/tests.
 * - **`notifyConnectionChange`** surfaces **`ConnectionState`** transitions to UI layers consistently.
 * - **`setupOnlineListeners`** bridges browser connectivity APIs into **`attemptConnection`** retries.
 * - **`checkCaptivePortal`** avoids useless WS storms on hotel/airport captive portals.
 * - **`scheduleNetworkRetry`** staggers retries after **`ConnectionState.Walled`** detections.
 * - **`WS_RETRY_INTERVAL`** bounds polling-mode upgrade attempts while streaming is active.
 * - **`createStreamingTransport`** encapsulates HTTP streaming handshake distinct from WS RFC6455 flow.
 * - **`setSendFn` / `resubscribeAll`** keep subscription routing coherent across transport swaps.
 * - **`ConnectionState.Offline/Walled`** branch **`attemptConnection`** early without socket churn.
 * - **`tryWebSocket`** owns fallback timer cancellation paths when polling succeeds later.
 * - **`switchToStreaming`** lazily constructs streaming transport handlers once per client lifetime.
 * - **`startWsRetry`** schedules periodic WS attempts without starving the event loop.
 * - **`configureApeLogging`** allows silent CI runs while preserving optional verbose diagnostics.
 * - **`apeLog`** namespaces browser/client logs separately from server diagnostics for readability.
 * - **`buildClientInterface`** remains the stable façade returned to application authors/tests.
 * - **`connectSocket.autoReconnect`** toggles user-controlled reconnect policy without hidden globals.
 *
 * @private
 */

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
 * @type {Array<{type: string, data: any, resolve: function, reject: function, createdAt: number, timer: number}>}
 * @private
 */
const aWaitingSend = [];

/**
 * Whether auto-reconnect is enabled
 * @type {boolean}
 * @private
 */
let reconnect = false;

/**
 * Last server `clientId` from `__connected__` — appended as `?resume=` on reconnect.
 * @type {string|null}
 * @private
 */
let lastResumeClientId = null;

/**
 * Browser reconnect backoff attempt counter (mirrors Node `connection-reconnect`).
 * @type {number}
 * @private
 */
let reconnectBackoffAttempt = 0;

/**
 * Timer id for scheduled reconnect after backoff.
 * @type {ReturnType<typeof setTimeout>|null}
 * @private
 */
let reconnectBackoffTimer = null;

/**
 * Consecutive reachability pings that failed with a network error or timeout (backoff input).
 * @type {number}
 * @private
 */
let failedPings = 0;

/**
 * Guard so only one connection attempt runs at a time (see connection/connectAttempt.js).
 * @type {ReturnType<typeof createConnectAttempt>}
 * @private
 */
const connectAttempt = createConnectAttempt();

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
 * Persist Phase 1 handshake fields for logical reconnect (`resume` + session cookie).
 *
 * @param {{ clientId?: string, sessionId?: string }} data - `__connected__` payload
 * @private
 */
function applyConnectedHandshake(data) {
  if (data.clientId) lastResumeClientId = data.clientId;
  if (typeof document !== "undefined" && data.sessionId) {
    const maxAgeSec = 60 * 60 * 24 * 30;
    document.cookie = `sessionId=${encodeURIComponent(data.sessionId)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
  }
}

/**
 * Cancel pending reconnect backoff timer (transport switch or successful open).
 * @private
 */
function clearReconnectBackoffTimer() {
  if (reconnectBackoffTimer != null) {
    clearTimeout(reconnectBackoffTimer);
    reconnectBackoffTimer = null;
  }
}

/**
 * HTTP streaming fallback (see connection/streamingFallback.js); owns the streaming
 * transport and the WebSocket-upgrade retry timer.
 * @private
 */
const fallback = createStreamingFallback({
  getConfiguredTransport: () => configuredTransport,
  getCurrentTransport: () => currentTransport,
  setCurrentTransport: (v) => {
    currentTransport = v;
  },
  setReady: (v) => {
    ready = v;
  },
  endConnectAttempt: connectAttempt.end,
  flushWaitingMessages: (sendFn) => flushQueue(aWaitingSend, sendFn),
  tryWebSocket: () => tryWebSocket(true),
});
const { switchToStreaming } = fallback;

const tryWebSocket = require("./connectSocket-tryWs.js").createTryWebSocket({
  clearReconnectBackoffTimer,
  getSocketUrl,
  getLastResumeClientId: () => lastResumeClientId,
  WebSocketCtor: WebSocket,
  wsFallbackTimeoutMs: WS_FALLBACK_TIMEOUT,
  getConfiguredTransport: () => configuredTransport,
  switchToStreaming,
  getReconnectBackoffAttempt: () => reconnectBackoffAttempt,
  setReconnectBackoffAttempt: (v) => {
    reconnectBackoffAttempt = v;
  },
  getCurrentTransport: () => currentTransport,
  setCurrentTransport: (v) => {
    currentTransport = v;
  },
  getStreamingTransport: fallback.getStreamingTransport,
  getWsRetryTimer: fallback.getWsRetryTimer,
  setWsRetryTimer: fallback.setWsRetryTimer,
  setSocketRef: (v) => {
    __socket = v;
  },
  setReady: (v) => {
    ready = v;
  },
  getReadySnapshot: () => ready,
  endConnectAttempt: connectAttempt.end,
  setSendFn,
  resubscribeAll,
  notifyConnectionChange,
  ConnectionState,
  flushWaitingMessages: (sendFn) => flushQueue(aWaitingSend, sendFn),
  wsSend,
  jss,
  applyConnectedHandshake,
  waitingOn,
  processIncomingData,
  dispatchMessage,
  getReconnectFlag: () => reconnect,
  reconnectDelayMs,
  getReconnectBackoffTimer: () => reconnectBackoffTimer,
  setReconnectBackoffTimer: (v) => {
    reconnectBackoffTimer = v;
  },
  connectSocketRoot: () => connectSocket(),
});

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
  // One attempt at a time: a second request to connect while one is in flight
  // (every queued call asks for one) must not open a second socket.
  if (connectAttempt.inFlight()) return;

  clearReconnectBackoffTimer();

  // Check browser online status first
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    notifyConnectionChange(ConnectionState.Offline);
    return;
  }

  connectAttempt.start();
  notifyConnectionChange(ConnectionState.Connecting);

  // Is the server reachable, and is it the ape (not a captive portal)?
  const ping = await checkCaptivePortal();
  if (ping === "walled") {
    connectAttempt.end();
    notifyConnectionChange(ConnectionState.Walled);
    scheduleNetworkRetry(attemptConnection);
    return;
  }
  if (ping === "unreachable") {
    // Server down or restarting: not a captive portal. Retry soon, with backoff.
    connectAttempt.end();
    notifyConnectionChange(ConnectionState.Disconnected);
    scheduleNetworkRetry(attemptConnection, pingRetryDelayMs(failedPings++));
    return;
  }
  failedPings = 0;

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
 *
 * @param {Record<string, unknown>} [maybeOptions] - Optional `{ logging }` forwarded to configureApeLogging
 */
function connectSocket(maybeOptions) {
  if (
    maybeOptions &&
    typeof maybeOptions === "object" &&
    "logging" in maybeOptions
  ) {
    configureApeLogging(maybeOptions.logging);
  }

  // Return existing interface if already connected
  if (__socket && __socket.readyState !== WebSocket.CLOSED)
    return buildClientInterface();
  if (currentTransport === "polling" && fallback.getStreamingTransport()?.isConnected())
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
     * // Calls /users/123 endpoint — dynamic segment via bracket access
     * sender.users[123]({ action: 'get' })
     *
     * @type {Proxy}
     */
    sender: wrap(sender),

    /**
     * Register a message receiver/handler
     * @see {@link module:client/connection/messageHandler.setOnReceiver}
     */
    setOnReceiver,

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

/**
 * Configure api-ape internal logging (call before first connection if possible).
 * @param {boolean|Object} logging - `false` silences framework logs; object supplies custom log/warn/error handlers
 */
connectSocket.configureLogging = configureApeLogging;

export default connectSocket;
export { ConnectionState };
