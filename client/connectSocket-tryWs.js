/**
 * @fileoverview Browser WebSocket attempt + lifecycle handlers for connectSocket.
 *
 * Domain context: Keeps the reconnect/backoff and RPC-teardown behavior documented in
 * {@link module:client/connectSocket} while satisfying repository line-count hooks.
 *
 * Technical context: Wired via a shallow `deps` bag passed from `connectSocket.js` so
 * this module stays free of circular imports with the public entry function.
 *
 * @module client/connectSocket-tryWs
 */

/**
 * Factory that returns `tryWebSocket(isRetry)` bound to shared browser transport state.
 *
 * @param {Object} d - Dependencies from {@link module:client/connectSocket}
 * @param {function(): void} d.clearReconnectBackoffTimer
 * @param {function(string|null): string} d.getSocketUrl
 * @param {function(): string|null} d.getLastResumeClientId
 * @param {typeof WebSocket} d.WebSocketCtor
 * @param {number} d.wsFallbackTimeoutMs
 * @param {function(): string} d.getConfiguredTransport
 * @param {function(): void} d.switchToStreaming
 * @param {function(): number} d.getReconnectBackoffAttempt
 * @param {function(number): void} d.setReconnectBackoffAttempt
 * @param {function(): string|null} d.getCurrentTransport
 * @param {function(string|null): void} d.setCurrentTransport
 * @param {function(): import('./transports/streaming').StreamingTransport|null} d.getStreamingTransport
 * @param {function(): number|null} d.getWsRetryTimer
 * @param {function(number|null): void} d.setWsRetryTimer
 * @param {function(import('./transports/streaming').StreamingTransport|null): void} d.setStreamingTransportRef
 * @param {function(WebSocket|false): void} d.setSocketRef
 * @param {function(boolean): void} d.setReady
 * @param {function(function(string): void): void} d.setSendFn
 * @param {function(): void} d.resubscribeAll
 * @param {function(string): void} d.notifyConnectionChange
 * @param {typeof import('./connection/state').ConnectionState} d.ConnectionState
 * @param {function(function(string, *, number): Promise<*>): void} d.flushWaitingMessages
 * @param {function(string, *, number, boolean=): Promise<*>} d.wsSend
 * @param {typeof import('../utils/jss').default} d.jss
 * @param {function(Object): void} d.applyConnectedHandshake
 * @param {Object.<string, function(Error|null, *, boolean=): void>} d.waitingOn
 * @param {function(*, *): Promise<*>} d.processIncomingData
 * @param {function(string, *, *): void} d.dispatchMessage
 * @param {function(): boolean} d.getReconnectFlag
 * @param {function(number): number} d.reconnectDelayMs
 * @param {function(): ReturnType<typeof setTimeout>|null} d.getReconnectBackoffTimer
 * @param {function(ReturnType<typeof setTimeout>|null): void} d.setReconnectBackoffTimer
 * @param {function(): void} d.connectSocketRoot
 * @returns {function(boolean=): void}
 */
function createTryWebSocket(d) {
  /**
   * Attempt WebSocket transport (initial or streaming-upgrade retry).
   *
   * @param {boolean} [isRetry=false] - True when invoked from polling retry timer
   * @returns {void}
   */
  return function tryWebSocket(isRetry = false) {
    d.clearReconnectBackoffTimer();
    const ws = new d.WebSocketCtor(d.getSocketUrl(d.getLastResumeClientId()));
    let fallbackTimer = null;

    if (!isRetry && d.getConfiguredTransport() === "auto") {
      fallbackTimer = setTimeout(() => {
        if (ws.readyState !== d.WebSocketCtor.OPEN) {
          ws.close();
          d.switchToStreaming();
        }
      }, d.wsFallbackTimeoutMs);
    }

    /**
     * Handle WebSocket connection opened
     * @returns {void}
     */
    ws.onopen = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);

      d.setReconnectBackoffAttempt(0);
      d.clearReconnectBackoffTimer();

      if (isRetry && d.getCurrentTransport() === "polling") {
        const st = d.getStreamingTransport();
        if (st) st.close();
        const wrt = d.getWsRetryTimer();
        if (wrt) {
          clearInterval(wrt);
          d.setWsRetryTimer(null);
        }
      }

      d.setCurrentTransport("websocket");
      d.setSocketRef(ws);
      d.setReady(true);

      d.setSendFn((msg) => ws.send(d.jss.stringify(msg)));
      d.resubscribeAll();

      d.notifyConnectionChange(d.ConnectionState.Connected);
      d.flushWaitingMessages(d.wsSend);
    };

    /**
     * Handle incoming WebSocket messages
     * @param {MessageEvent} event - Browser message event
     * @returns {Promise<void>}
     */
    ws.onmessage = async (event) => {
      const { err, type, queryId, data } = d.jss.parse(event.data);

      if (type === "__connected__" && data && typeof data === "object") {
        d.applyConnectedHandshake(data);
      }

      if (queryId && d.waitingOn[queryId]) {
        const hydratedData = await d.processIncomingData(data, err);
        d.waitingOn[queryId](err, hydratedData);
        delete d.waitingOn[queryId];
        return;
      }

      const processed = await d.processIncomingData(data, err);
      d.dispatchMessage(type, err, processed);
    };

    /**
     * Handle WebSocket errors
     * @returns {void}
     */
    ws.onerror = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (!isRetry && d.getConfiguredTransport() === "auto" && !d.getReadySnapshot())
        d.switchToStreaming();
    };

    /**
     * Handle WebSocket connection closed
     * @returns {void}
     */
    ws.onclose = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      d.setSocketRef(false);
      d.setReady(false);

      const pendingRpcIds = Object.keys(d.waitingOn);
      if (pendingRpcIds.length > 0) {
        const dropErr = new Error(
          "[api-ape browser] WebSocket closed while RPC responses were pending — responses will not arrive.",
        );
        for (const qid of pendingRpcIds) {
          d.waitingOn[qid](dropErr);
          delete d.waitingOn[qid];
        }
      }

      if (d.getCurrentTransport() === "websocket") {
        d.notifyConnectionChange(d.ConnectionState.Disconnected);
        if (d.getReconnectFlag()) {
          d.clearReconnectBackoffTimer();
          const delayMs = d.reconnectDelayMs(d.getReconnectBackoffAttempt());
          d.setReconnectBackoffAttempt(d.getReconnectBackoffAttempt() + 1);
          d.setReconnectBackoffTimer(
            setTimeout(() => {
              d.setReconnectBackoffTimer(null);
              d.connectSocketRoot();
            }, delayMs),
          );
        }
      }
    };
  };
}

module.exports = { createTryWebSocket };
