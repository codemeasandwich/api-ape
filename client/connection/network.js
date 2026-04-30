/**
 * @fileoverview Network detection and captive portal utilities for api-ape client
 *
 * This module provides network-related functionality for the api-ape client:
 * - Captive portal detection (hotel/airport WiFi login pages)
 * - Online/offline browser event handling
 * - URL construction for WebSocket and HTTP endpoints
 * - Network retry scheduling
 *
 * ## Captive Portal Detection
 * Captive portals intercept HTTP requests and redirect to login pages.
 * This module detects them by:
 * 1. Pinging a known endpoint (/api/ape/ping)
 * 2. Verifying the response contains expected JSON structure
 * 3. Validating timestamp to detect proxy replay attacks
 *
 * @module client/connection/network
 * @see {@link module:client/connection/state} for connection state management
 *
 * @example
 * import {
 *   checkCaptivePortal,
 *   getSocketUrl,
 *   getBaseUrl,
 *   setupOnlineListeners
 * } from './network'
 *
 * // Check if we're behind a captive portal
 * const status = await checkCaptivePortal()
 * if (status === 'walled') {
 *   console.log('Please complete WiFi login')
 * }
 *
 * // Get WebSocket URL
 * const wsUrl = getSocketUrl() // 'wss://example.com/api/ape'
 * const resumed = getSocketUrl(priorClientId) // adds ?resume=… when reconnecting
 */

import { apeLog } from "../../utils/apeLogger.js";
import { ConnectionState, notifyConnectionChange } from "./state";

/**
 * Timeout duration for ping requests (milliseconds)
 * If the ping doesn't complete within this time, assume captive portal
 * @constant {number}
 * @private
 */
const PING_TIMEOUT = 3000;

/**
 * Maximum allowed clock skew between client and server (milliseconds)
 * Used to detect stale/replayed ping responses from caching proxies
 * @constant {number}
 * @private
 */
const MAX_PING_CLOCK_SKEW = 60000;

/**
 * Interval between WebSocket retry attempts when in polling mode (milliseconds)
 * Also used as the interval for network retry checks
 * @constant {number}
 */
export const WS_RETRY_INTERVAL = 30000;

/**
 * Timer ID for scheduled network retry
 * @type {number|null}
 * @private
 */
let networkCheckTimer = null;

/**
 * Check if running in development/local mode
 *
 * Used to enable additional debug logging when running locally.
 * Returns true for localhost, 127.0.0.1, and IPv6 loopback addresses.
 *
 * @returns {boolean} True if running on a local development server
 *
 * @example
 * if (isDevMode()) {
 *   console.log('Debug: Connection attempt started')
 * }
 */
export function isDevMode() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

/**
 * Build the ping URL for captive portal detection
 *
 * Constructs the full URL to the /api/ape/ping endpoint based on
 * the current page's protocol, hostname, and port.
 *
 * @returns {string} Full URL to the ping endpoint
 *
 * @example
 * // On https://example.com
 * getPingUrl() // Returns: 'https://example.com/api/ape/ping'
 *
 * // On http://localhost:3000
 * getPingUrl() // Returns: 'http://localhost:3000/api/ape/ping'
 */
export function getPingUrl() {
  const hostname = window.location.hostname;
  const isHttps = window.location.protocol === "https:";
  const port = window.location.port || (isHttps ? 443 : 80);
  const protocol = isHttps ? "https" : "http";
  const portSuffix = port !== 80 && port !== 443 ? `:${port}` : "";
  return `${protocol}://${hostname}${portSuffix}/api/ape/ping`;
}

/**
 * Check for captive portal by pinging the api-ape ping endpoint
 *
 * This function detects captive portals (hotel/airport WiFi login pages)
 * by making a request to a known endpoint and validating the response.
 *
 * ## Detection Logic
 * 1. Sends GET request to /api/ape/ping
 * 2. Verifies HTTP 200 response
 * 3. Checks response JSON contains `{ ok: true }`
 * 4. Validates timestamp is within acceptable clock skew
 *
 * If any check fails, assumes we're behind a captive portal.
 *
 * @returns {Promise<'ok'|'walled'>} 'ok' if real internet connection,
 *                                    'walled' if captive portal detected
 *
 * @example
 * const status = await checkCaptivePortal()
 *
 * if (status === 'walled') {
 *   // Show message to user to complete WiFi login
 *   showCaptivePortalWarning()
 * } else {
 *   // Proceed with WebSocket connection
 *   connectWebSocket()
 * }
 *
 * @example
 * // In connection flow
 * async function attemptConnection() {
 *   if (await checkCaptivePortal() === 'walled') {
 *     notifyConnectionChange(ConnectionState.Walled)
 *     scheduleNetworkRetry(attemptConnection)
 *     return
 *   }
 *   // Continue with connection...
 * }
 */
export async function checkCaptivePortal() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT);

    const response = await fetch(getPingUrl(), {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (isDevMode()) {
        apeLog.error("[DEV] Ping failed: HTTP", response.status);
      }
      return "walled";
    }

    const data = await response.json();

    // Verify response is genuine (not a captive portal redirect page)
    if (data?.ok !== true) {
      if (isDevMode()) {
        apeLog.error("[DEV] Ping failed: invalid response", data);
      }
      return "walled";
    }

    // Validate timestamp to detect proxy replay attacks
    if (typeof data.ts === "number") {
      const now = Date.now();
      const skew = Math.abs(now - data.ts);
      if (skew > MAX_PING_CLOCK_SKEW) {
        if (isDevMode()) {
          const direction =
            now > data.ts ? "Server time is behind" : "Server time is ahead";
          apeLog.error(
            `[DEV] Ping failed: timestamp too old/stale\n` +
              `  Skew: ${skew}ms (~${Math.round(skew / 1000)}s)\n` +
              `  Client time: ${new Date(now).toISOString()}\n` +
              `  Server time: ${new Date(data.ts).toISOString()}\n` +
              `  ${direction} by ${Math.round(skew / 1000)}s\n` +
              `  Max allowed: ${MAX_PING_CLOCK_SKEW}ms`,
          );
        }
        return "walled";
      }
    }

    return "ok";
  } catch (err) {
    if (isDevMode()) {
      apeLog.error("[DEV] Ping failed:", err.message || err);
    }
    return "walled";
  }
}

/**
 * Schedule a retry of network connectivity check
 *
 * Used when in 'walled' or 'offline' states to periodically
 * check if network connectivity has been restored.
 *
 * Only one retry can be scheduled at a time - calling this
 * function while a retry is already scheduled has no effect.
 *
 * @param {Function} attemptConnectionFn - Function to call for connection attempt
 * @returns {void}
 *
 * @example
 * // In connection handler
 * if (status === 'walled') {
 *   notifyConnectionChange(ConnectionState.Walled)
 *   scheduleNetworkRetry(attemptConnection)
 * }
 *
 * @example
 * // The scheduled function will be called after WS_RETRY_INTERVAL
 * scheduleNetworkRetry(() => {
 *   console.log('Retrying connection...')
 *   attemptConnection()
 * })
 */
export function scheduleNetworkRetry(attemptConnectionFn) {
  if (networkCheckTimer) return;
  networkCheckTimer = setTimeout(() => {
    networkCheckTimer = null;
    attemptConnectionFn();
  }, WS_RETRY_INTERVAL);
}

/**
 * Setup browser online/offline event listeners
 *
 * Registers event listeners for the browser's online/offline events.
 * When the browser goes online, triggers a connection attempt.
 * When the browser goes offline, notifies the connection state.
 *
 * This function is safe to call in non-browser environments (no-op).
 *
 * @param {Function} attemptConnectionFn - Function to call when browser goes online
 * @returns {void}
 *
 * @example
 * // Setup listeners on module load
 * setupOnlineListeners(attemptConnection)
 *
 * // Now these events are handled automatically:
 * // - Browser goes offline -> ConnectionState.Offline
 * // - Browser goes online -> attemptConnection() is called
 */
export function setupOnlineListeners(attemptConnectionFn) {
  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    apeLog.log("Browser went online, checking network...");
    attemptConnectionFn();
  });

  window.addEventListener("offline", () => {
    apeLog.log("Browser went offline");
    notifyConnectionChange(ConnectionState.Offline);
  });
}

/**
 * Get the base URL for HTTP API endpoints
 *
 * Constructs the base URL (protocol + hostname + port) for making
 * HTTP requests to the api-ape server. Used for file uploads/downloads
 * and HTTP streaming fallback.
 *
 * For local development servers (localhost, 127.0.0.1, [::1]),
 * defaults to port 9010 if no port is specified.
 *
 * @returns {string} Base URL without trailing slash
 *
 * @example
 * // On https://example.com
 * getBaseUrl() // Returns: 'https://example.com'
 *
 * // On http://localhost (no port specified)
 * getBaseUrl() // Returns: 'http://localhost:9010'
 *
 * // On http://localhost:3000
 * getBaseUrl() // Returns: 'http://localhost:3000'
 *
 * @example
 * // Usage for file downloads
 * const baseUrl = getBaseUrl()
 * const fileUrl = `${baseUrl}/api/ape/data/${fileHash}`
 * const response = await fetch(fileUrl)
 */
export function getBaseUrl() {
  const hostname = window.location.hostname;
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const isHttps = window.location.protocol === "https:";
  const port = window.location.port || (isLocal ? 9010 : isHttps ? 443 : 80);
  const protocol = isHttps ? "https" : "http";
  const portSuffix = port !== 80 && port !== 443 ? `:${port}` : "";
  return `${protocol}://${hostname}${portSuffix}`;
}

/**
 * Get the WebSocket URL for api-ape connections
 *
 * Constructs the full WebSocket URL for connecting to the api-ape server.
 * Automatically selects ws:// or wss:// based on the page's protocol.
 *
 * For local development servers (localhost, 127.0.0.1, [::1]),
 * defaults to port 9010 if no port is specified.
 *
 * @param {string|null} [resumeClientId] - Prior `clientId` from `__connected__`;
 *   when set, appended as `?resume=` for Phase 1 logical reconnect (browser has no
 *   custom upgrade headers).
 *
 * @returns {string} WebSocket URL (ws:// or wss://), with optional `?resume=` query
 *
 * @example
 * // On https://example.com
 * getSocketUrl() // Returns: 'wss://example.com/api/ape'
 *
 * // On http://localhost:3000
 * getSocketUrl() // Returns: 'ws://localhost:3000/api/ape'
 *
 * // On http://localhost (no port)
 * getSocketUrl() // Returns: 'ws://localhost:9010/api/ape'
 *
 * // Usage in connection code
 * const ws = new WebSocket(getSocketUrl())
 * ws.onopen = () => console.log('Connected!')
 */
export function getSocketUrl(resumeClientId) {
  const hostname = window.location.hostname;
  const localServers = ["localhost", "127.0.0.1", "[::1]"];
  const isLocal = localServers.includes(hostname);
  const isHttps = window.location.protocol === "https:";
  const port = window.location.port || (isLocal ? 9010 : isHttps ? 443 : 80);
  const protocol = isHttps ? "wss" : "ws";
  const portSuffix = port !== 80 && port !== 443 ? `:${port}` : "";
  let url = `${protocol}://${hostname}${portSuffix}/api/ape`;
  if (resumeClientId) {
    url += `?resume=${encodeURIComponent(resumeClientId)}`;
  }
  return url;
}
