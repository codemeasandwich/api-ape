const messageHash = require('./messageHash')

describe('messageHash', () => {

    test('returns consistent hash for same input', () => {
        const input = 'hello world'
        const hash1 = messageHash(input)
        const hash2 = messageHash(input)
        expect(hash1).toBe(hash2)
    })

    test('returns different hashes for different inputs', () => {
        const hash1 = messageHash('message one')
        const hash2 = messageHash('message two')
        expect(hash1).not.toBe(hash2)
    })

    test('returns base32-encoded string', () => {
        const hash = messageHash('test message')
        // Base32 alphabet used: 0-9, A-Z excluding I, L, O, U
        expect(hash).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
    })

    test('handles empty string', () => {
        const hash = messageHash('')
        expect(typeof hash).toBe('string')
        expect(hash.length).toBeGreaterThan(0)
    })

    test('handles special characters', () => {
        const hash = messageHash('特殊文字 🎉 emoji!')
        expect(typeof hash).toBe('string')
        expect(hash.length).toBeGreaterThan(0)
    })

    test('handles long strings', () => {
        const longString = 'x'.repeat(10000)
        const hash = messageHash(longString)
        expect(typeof hash).toBe('string')
        // Hash should be compact regardless of input length
        expect(hash.length).toBeLessThan(20)
    })

    test('handles JSON strings', () => {
        const json = JSON.stringify({ type: '/message', data: { user: 'test' } })
        const hash = messageHash(json)
        expect(typeof hash).toBe('string')
        expect(hash.length).toBeGreaterThan(0)
    })

    test('different order produces different hash', () => {
        const hash1 = messageHash('abc')
        const hash2 = messageHash('bca')
        expect(hash1).not.toBe(hash2)
    })
})
