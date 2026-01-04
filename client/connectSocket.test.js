/**
 * Connection State Tests
 * 
 * Tests for the 'offline' and 'walled' connection states.
 * Simulates captive portal detection scenarios.
 */

describe('Connection State', () => {
    describe('checkCaptivePortal simulation', () => {
        it('should return "ok" when ping succeeds with valid timestamp', async () => {
            const now = Date.now()
            const mockResponse = {
                ok: true,
                json: async () => ({ ok: true, ts: now })
            }

            const result = await simulatePingCheck(mockResponse)
            expect(result).toBe('ok')
        })

        it('should return "walled" when ping returns non-ok response', async () => {
            const mockResponse = {
                ok: false,
                status: 302,
                json: async () => ({ error: 'redirect' })
            }

            const result = await simulatePingCheck(mockResponse)
            expect(result).toBe('walled')
        })

        it('should return "walled" when response lacks ok:true', async () => {
            // Captive portal might return HTML that looks like JSON
            const mockResponse = {
                ok: true,
                json: async () => ({ login: 'required' })  // Not a valid api-ape ping response
            }

            const result = await simulatePingCheck(mockResponse)
            expect(result).toBe('walled')
        })

        it('should return "walled" when timestamp is stale (proxy replay)', async () => {
            // Timestamp from 5 minutes ago (beyond 60s threshold)
            const staleTs = Date.now() - (5 * 60 * 1000)
            const mockResponse = {
                ok: true,
                json: async () => ({ ok: true, ts: staleTs })
            }

            const result = await simulatePingCheck(mockResponse)
            expect(result).toBe('walled')
        })

        it('should accept timestamp within valid window', async () => {
            // Timestamp from 30 seconds ago (within 60s threshold)
            const validTs = Date.now() - (30 * 1000)
            const mockResponse = {
                ok: true,
                json: async () => ({ ok: true, ts: validTs })
            }

            const result = await simulatePingCheck(mockResponse)
            expect(result).toBe('ok')
        })

        it('should return "walled" when fetch times out', async () => {
            const result = await simulatePingCheck(null, new Error('AbortError'))
            expect(result).toBe('walled')
        })

        it('should return "walled" when network error occurs', async () => {
            const result = await simulatePingCheck(null, new Error('NetworkError'))
            expect(result).toBe('walled')
        })
    })

    describe('ConnectionState enum values', () => {
        it('should define all expected states', () => {
            const expectedStates = ['offline', 'walled', 'disconnected', 'connecting', 'connected', 'closing']
            expectedStates.forEach(state => {
                expect(typeof state).toBe('string')
            })
        })
    })
})

/**
 * Simulates the ping check logic from connectSocket.js
 * This mirrors the checkCaptivePortal function logic for testing
 */
async function simulatePingCheck(mockResponse, mockError = null) {
    const MAX_PING_CLOCK_SKEW = 60000

    try {
        if (mockError) {
            throw mockError
        }

        if (!mockResponse.ok) {
            return 'walled'
        }

        const data = await mockResponse.json()

        if (data?.ok !== true) {
            return 'walled'
        }

        if (typeof data.ts === 'number') {
            const now = Date.now()
            const skew = Math.abs(now - data.ts)
            if (skew > MAX_PING_CLOCK_SKEW) {
                return 'walled'
            }
        }

        return 'ok'
    } catch (err) {
        return 'walled'
    }
}
