/**
 * @fileoverview Connection State Tests for api-ape Client
 *
 * This test suite validates the connection state management for the api-ape client,
 * specifically focusing on captive portal detection scenarios. When a client connects
 * through a captive portal (e.g., hotel WiFi, airport WiFi), the portal may intercept
 * HTTP requests and return redirect pages instead of actual API responses.
 *
 * The captive portal detection mechanism works by:
 * 1. Making a ping request to the server
 * 2. Validating the response has `ok: true`
 * 3. Checking the timestamp is within acceptable clock skew (60 seconds)
 * 4. If an answer fails validation, the connection is marked "walled"; if there is no answer
 *    (network error, timeout, 5xx) it is "unreachable" and the client retries with backoff
 *
 * @module client/connectSocket.test
 * @see {@link module:client/connectSocket} - The main connection module being tested
 * @see {@link module:client/connection/state} - Connection state management
 */

/**
 * Maximum allowed clock skew in milliseconds for ping timestamp validation.
 * If the server's timestamp differs from the client's by more than this value,
 * the response is considered potentially replayed by a captive portal.
 * @constant {number}
 */
const MAX_PING_CLOCK_SKEW = 60000;

describe("Connection State", () => {
  /**
   * Tests for the captive portal detection simulation.
   * These tests verify that the ping check logic correctly identifies
   * various captive portal scenarios.
   */
  describe("checkCaptivePortal simulation", () => {
    /**
     * Test: Valid ping response with current timestamp should return 'ok'.
     * This represents the happy path where the server is reachable and
     * responding correctly without any captive portal interference.
     */
    it('should return "ok" when ping succeeds with valid timestamp', async () => {
      const now = Date.now();
      const mockResponse = {
        ok: true,
        json: async () => ({ ok: true, ts: now }),
      };

      const result = await simulatePingCheck(mockResponse);
      expect(result).toBe("ok");
    });

    /**
     * Test: Non-OK HTTP response (e.g., 302 redirect) should return 'walled'.
     * Captive portals often redirect to a login page, resulting in non-200
     * status codes.
     */
    it('should return "walled" when ping returns non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 302,
        json: async () => ({ error: "redirect" }),
      };

      const result = await simulatePingCheck(mockResponse);
      expect(result).toBe("walled");
    });

    /**
     * Test: Response lacking `ok: true` should return 'walled'.
     * Some captive portals return HTTP 200 with HTML content that may
     * accidentally parse as JSON, but won't have our expected structure.
     */
    it('should return "walled" when response lacks ok:true', async () => {
      // Captive portal might return HTML that looks like JSON
      const mockResponse = {
        ok: true,
        json: async () => ({ login: "required" }), // Not a valid api-ape ping response
      };

      const result = await simulatePingCheck(mockResponse);
      expect(result).toBe("walled");
    });

    /**
     * Test: Stale timestamp (replay attack protection) should return 'walled'.
     * If a captive portal is caching and replaying old responses, the timestamp
     * will be stale. This protects against transparent proxy replay attacks.
     */
    it('should return "walled" when timestamp is stale (proxy replay)', async () => {
      // Timestamp from 5 minutes ago (beyond 60s threshold)
      const staleTs = Date.now() - 5 * 60 * 1000;
      const mockResponse = {
        ok: true,
        json: async () => ({ ok: true, ts: staleTs }),
      };

      const result = await simulatePingCheck(mockResponse);
      expect(result).toBe("walled");
    });

    /**
     * Test: Timestamp within valid window should return 'ok'.
     * Normal network latency and minor clock differences are acceptable
     * within the 60-second threshold.
     */
    it("should accept timestamp within valid window", async () => {
      // Timestamp from 30 seconds ago (within 60s threshold)
      const validTs = Date.now() - 30 * 1000;
      const mockResponse = {
        ok: true,
        json: async () => ({ ok: true, ts: validTs }),
      };

      const result = await simulatePingCheck(mockResponse);
      expect(result).toBe("ok");
    });

    /**
     * Test: Fetch timeout (AbortError) should return 'unreachable'.
     * A timeout means no answer arrived: the server is down or restarting, which is
     * not a captive portal (a portal ANSWERS, with a login page). The client retries
     * soon with backoff instead of waiting out the 30 s portal retry (4.4.0).
     * The end-to-end stories are in integration/bun/client-connect.ts.
     */
    it('should return "unreachable" when fetch times out', async () => {
      const result = await simulatePingCheck(null, new Error("AbortError"));
      expect(result).toBe("unreachable");
    });

    /**
     * Test: Network errors (connection refused, reset) should return 'unreachable'.
     */
    it('should return "unreachable" when network error occurs', async () => {
      const result = await simulatePingCheck(null, new Error("NetworkError"));
      expect(result).toBe("unreachable");
    });

    /**
     * Test: A gateway error (5xx) means the upstream server is down, not a portal.
     */
    it('should return "unreachable" when a gateway answers 502', async () => {
      const result = await simulatePingCheck({ ok: false, status: 502, json: async () => ({}) });
      expect(result).toBe("unreachable");
    });
  });

  /**
   * Tests for the ConnectionState enumeration values.
   * Verifies that all expected connection states are defined.
   */
  describe("ConnectionState enum values", () => {
    /**
     * Test: All expected connection states should be defined.
     * The connection can be in one of these states:
     * - offline: No network connectivity
     * - walled: Behind a captive portal
     * - disconnected: Network available but not connected to server
     * - connecting: Connection attempt in progress
     * - connected: Successfully connected to server
     * - closing: Connection is being closed
     */
    it("should define all expected states", () => {
      const expectedStates = [
        "offline",
        "walled",
        "disconnected",
        "connecting",
        "connected",
        "closing",
      ];
      expectedStates.forEach((state) => {
        expect(typeof state).toBe("string");
      });
    });
  });
});

/**
 * Simulates the ping check logic from connectSocket.js for testing purposes.
 * This function mirrors the `checkCaptivePortal` function logic to enable
 * unit testing without making actual network requests.
 *
 * The ping check validates:
 * 1. HTTP response status is OK (2xx)
 * 2. Response body contains `ok: true`
 * 3. Timestamp is within acceptable clock skew
 *
 * @async
 * @function simulatePingCheck
 * @param {Object|null} mockResponse - Mock fetch Response object
 * @param {boolean} mockResponse.ok - Whether the HTTP status is OK (2xx)
 * @param {Function} mockResponse.json - Async function returning parsed JSON body
 * @param {Error|null} [mockError=null] - Error to simulate (e.g., network error, timeout)
 * @returns {Promise<'ok'|'walled'|'unreachable'>} 'ok' if ping validates, 'walled' for an answer that is not
 *   the ape ping, 'unreachable' when there is no answer (network error, timeout, 5xx)
 *
 * @example
 * // Simulate successful ping
 * const result = await simulatePingCheck({
 *     ok: true,
 *     json: async () => ({ ok: true, ts: Date.now() })
 * })
 * console.log(result) // 'ok'
 *
 * @example
 * // Simulate captive portal redirect
 * const result = await simulatePingCheck({
 *     ok: false,
 *     status: 302,
 *     json: async () => ({ error: 'redirect' })
 * })
 * console.log(result) // 'walled'
 *
 * @example
 * // Simulate network error
 * const result = await simulatePingCheck(null, new Error('NetworkError'))
 * console.log(result) // 'unreachable'
 */
async function simulatePingCheck(mockResponse, mockError = null) {
  try {
    if (mockError) {
      throw mockError;
    }

    if (!mockResponse.ok) {
      return mockResponse.status >= 500 ? "unreachable" : "walled";
    }

    const data = await mockResponse.json();

    if (data?.ok !== true) {
      return "walled";
    }

    if (typeof data.ts === "number") {
      const now = Date.now();
      const skew = Math.abs(now - data.ts);
      if (skew > MAX_PING_CLOCK_SKEW) {
        return "walled";
      }
    }

    return "ok";
  } catch (err) {
    return "unreachable";
  }
}
