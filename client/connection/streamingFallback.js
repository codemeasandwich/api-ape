/**
 * @fileoverview HTTP streaming fallback for the browser client.
 *
 * Domain context: when the WebSocket cannot open (corporate proxies, blocked upgrades)
 * the client falls back to HTTP streaming and keeps trying to upgrade back to a
 * WebSocket every `WS_RETRY_INTERVAL`.
 *
 * Technical context: extracted from `connectSocket.js` to keep that file under the
 * repository line-count limit. The factory owns the streaming transport and the
 * upgrade-retry timer, and reaches the shared connection state through the accessors
 * it is given.
 *
 * @module client/connection/streamingFallback
 * @see {@link module:client/connectSocket} for the caller
 */

import { apeLog } from "../../utils/apeLogger.js";
import { createStreamingTransport } from "../transports/streaming";
import { ConnectionState, notifyConnectionChange } from "./state";
import { WS_RETRY_INTERVAL } from "./network";
import { setSendFn, resubscribeAll } from "./subscriptions";
import { processIncomingData, dispatchMessage } from "./messageHandler";

/**
 * Create the streaming fallback bound to the client's shared state.
 *
 * @param {Object} d - Shared state accessors and callbacks from `connectSocket.js`
 * @param {function(): string|null} d.getCurrentTransport - Active transport
 * @param {function(string|null): void} d.setCurrentTransport - Set the active transport
 * @param {function(boolean): void} d.setReady - Mark the connection ready / not ready
 * @param {function(): void} d.endConnectAttempt - Mark the in-flight connection attempt finished
 * @param {function(function(string, *, number): Promise<*>): void} d.flushWaitingMessages - Send queued calls
 * @param {function(): void} d.tryWebSocket - Try to upgrade back to a WebSocket (as a retry)
 * @returns {{switchToStreaming: function(): void, startWsRetry: function(): void, getStreamingTransport: function(): Object|null, getWsRetryTimer: function(): *, setWsRetryTimer: function(*): void}}
 *   `switchToStreaming()` starts the fallback; the other members expose its state to the WebSocket path
 */
export function createStreamingFallback(d) {
  let streamingTransport = null;
  let wsRetryTimer = null;

  /**
   * Periodically try to upgrade from HTTP streaming back to a WebSocket.
   *
   * @returns {void}
   */
  function startWsRetry() {
    if (wsRetryTimer || d.getCurrentTransport() !== "polling") return;
    wsRetryTimer = setInterval(() => {
      if (d.getCurrentTransport() !== "polling") {
        clearInterval(wsRetryTimer);
        wsRetryTimer = null;
        return;
      }
      d.tryWebSocket();
    }, WS_RETRY_INTERVAL);
  }

  /**
   * Switch from WebSocket to HTTP streaming transport, creating it on first use.
   *
   * @returns {void}
   */
  function switchToStreaming() {
    apeLog.log("Switching to HTTP streaming transport");
    d.setCurrentTransport("polling");

    if (!streamingTransport) {
      streamingTransport = createStreamingTransport();

      streamingTransport.onMessage = async (msg) => {
        // `this.keepalive()` on the server: the call is still running. Over streaming the
        // reply is the POST's response and the call has no client timer to restart, so
        // the frame is just not a message for the page.
        if (msg._keepalive) return;
        const data = await processIncomingData(msg.data, msg.err);
        dispatchMessage(msg.type, msg.err, data);
      };

      streamingTransport.onOpen = () => {
        d.endConnectAttempt();
        d.setReady(true);

        // Set up subscription send function for streaming and re-subscribe
        setSendFn((msg) => streamingTransport.sendRaw(msg));
        resubscribeAll();

        notifyConnectionChange(ConnectionState.Connected);
        d.flushWaitingMessages((t, data, c) => streamingTransport.send(t, data, c));
        startWsRetry();
      };

      streamingTransport.onClose = () => {
        d.endConnectAttempt();
        d.setReady(false);
        notifyConnectionChange(ConnectionState.Disconnected);
      };

      streamingTransport.onError = (err) => {
        d.endConnectAttempt();
        apeLog.error("Streaming error:", err);
      };
    }

    streamingTransport.connect();
  }

  return {
    switchToStreaming,
    startWsRetry,
    getStreamingTransport: () => streamingTransport,
    getWsRetryTimer: () => wsRetryTimer,
    setWsRetryTimer: (v) => {
      wsRetryTimer = v;
    },
  };
}
