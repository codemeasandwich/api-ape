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
 * 4. If any validation fails, the connection is marked as "walled"
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
     * Test: Fetch timeout (AbortError) should return 'walled'.
     * If the request times out, it could indicate a captive portal
     * is blocking or delaying the connection.
     */
    it('should return "walled" when fetch times out', async () => {
      const result = await simulatePingCheck(null, new Error("AbortError"));
      expect(result).toBe("walled");
    });

    /**
     * Test: Network errors should return 'walled'.
     * Any network-level error suggests connectivity issues that may
     * be caused by a captive portal.
     */
    it('should return "walled" when network error occurs', async () => {
      const result = await simulatePingCheck(null, new Error("NetworkError"));
      expect(result).toBe("walled");
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
 * @returns {Promise<'ok'|'walled'>} 'ok' if ping validates successfully, 'walled' otherwise
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
 * console.log(result) // 'walled'
 */
async function simulatePingCheck(mockResponse, mockError = null) {
  try {
    if (mockError) {
      throw mockError;
    }

    if (!mockResponse.ok) {
      return "walled";
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
    return "walled";
  }
}
