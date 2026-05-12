const jss = require('./jss')

describe('JSS - JSON SuperSet', () => {

    describe('Primitives', () => {
        test('handles strings', () => {
            const input = { str: 'hello world' }
            const result = jss.parse(jss.stringify(input))
            expect(result.str).toBe('hello world')
        })

        test('handles numbers', () => {
            const input = { int: 42, float: 3.14, neg: -100 }
            const result = jss.parse(jss.stringify(input))
            expect(result.int).toBe(42)
            expect(result.float).toBe(3.14)
            expect(result.neg).toBe(-100)
        })

        test('handles booleans', () => {
            const input = { t: true, f: false }
            const result = jss.parse(jss.stringify(input))
            expect(result.t).toBe(true)
            expect(result.f).toBe(false)
        })

        test('handles null', () => {
            const input = { n: null }
            const result = jss.parse(jss.stringify(input))
            expect(result.n).toBe(null)
        })
    })

    describe('Special Types', () => {
        test('preserves Date objects', () => {
            const date = new Date('2025-01-01T12:00:00Z')
            const input = { created: date }
            const result = jss.parse(jss.stringify(input))
            expect(result.created).toBeInstanceOf(Date)
            expect(result.created.getTime()).toBe(date.getTime())
        })

        test('encodes RegExp objects', () => {
            const regex = /hello/
            const input = { pattern: regex }
            const result = jss.parse(jss.stringify(input))
            // RegExp is encoded/decoded - verify it's a RegExp
            expect(result.pattern).toBeInstanceOf(RegExp)
        })

        test('preserves Error objects', () => {
            const error = new Error('Something went wrong')
            error.name = 'CustomError'
            const input = { err: error }
            const result = jss.parse(jss.stringify(input))
            expect(result.err).toBeInstanceOf(Error)
            expect(result.err.message).toBe('Something went wrong')
            expect(result.err.name).toBe('CustomError')
        })

        test('handles undefined in objects', () => {
            const input = { defined: 'yes', notDefined: undefined }
            const result = jss.parse(jss.stringify(input))
            // undefined properties should round-trip
            expect(result.notDefined).toBe(undefined)
        })

        test('preserves Set objects', () => {
            const set = new Set([1, 2, 3, 'a', 'b'])
            const input = { items: set }
            const result = jss.parse(jss.stringify(input))
            expect(result.items).toBeInstanceOf(Set)
            expect(result.items.has(1)).toBe(true)
            expect(result.items.has('a')).toBe(true)
            expect(result.items.size).toBe(5)
        })

        test('preserves Map objects', () => {
            const map = new Map([['key1', 'value1'], ['key2', 42]])
            const input = { data: map }
            const result = jss.parse(jss.stringify(input))
            expect(result.data).toBeInstanceOf(Map)
            expect(result.data.get('key1')).toBe('value1')
            expect(result.data.get('key2')).toBe(42)
        })
    })

    describe('Objects and Arrays', () => {
        test('handles nested objects', () => {
            const input = {
                user: {
                    name: 'Alice',
                    profile: {
                        age: 30
                    }
                }
            }
            const result = jss.parse(jss.stringify(input))
            expect(result.user.name).toBe('Alice')
            expect(result.user.profile.age).toBe(30)
        })

        test('handles arrays', () => {
            const input = { items: [1, 2, 3, 'four', 'five'] }
            const result = jss.parse(jss.stringify(input))
            expect(result.items).toEqual([1, 2, 3, 'four', 'five'])
        })

        test('handles arrays with Dates', () => {
            const date = new Date('2025-06-15')
            const input = { mixed: ['text', 42, date, null] }
            const result = jss.parse(jss.stringify(input))
            expect(result.mixed[0]).toBe('text')
            expect(result.mixed[1]).toBe(42)
            expect(result.mixed[2]).toBeInstanceOf(Date)
            expect(result.mixed[3]).toBe(null)
        })
    })

    describe('encode/decode', () => {
        test('encode returns tagged object for Date', () => {
            const input = { d: new Date('2025-01-01') }
            const encoded = jss.encode(input)
            expect(encoded['d<!D>']).toBeDefined()
        })

        test('decode restores Date from tagged object', () => {
            const encoded = { 'd<!D>': 1735689600000 }
            const decoded = jss.decode(encoded)
            expect(decoded.d).toBeInstanceOf(Date)
        })

        test('encode handles Error type', () => {
            const input = { e: new Error('test') }
            const encoded = jss.encode(input)
            expect(encoded['e<!E>']).toBeDefined()
        })

        test('encode handles Set type', () => {
            const input = { s: new Set([1, 2]) }
            const encoded = jss.encode(input)
            expect(encoded['s<!S>']).toBeDefined()
        })

        test('encode handles Map type', () => {
            const input = { m: new Map([['a', 1]]) }
            const encoded = jss.encode(input)
            expect(encoded['m<!M>']).toBeDefined()
        })
    })

    describe('Circular References', () => {
        test('handles self-referencing object', () => {
            const original = {
                id: 123,
                name: 'Test'
            }
            original.foo = original

            const encoded = jss.encode(original)
            const result = jss.decode(encoded)

            expect(result.id).toBe(123)
            expect(result.name).toBe('Test')
            expect(result.foo).toBe(result)
        })

        test('handles self-referencing object', () => {
            const original = {
                name: 'Test',
                cat: {
                    cars: true
                },
                bar: {
                    baz: true
                }
            }
            original.cat.foo = original.bar.baz

            const encoded = jss.encode(original)
            const result = jss.decode(encoded)

            expect(result.cat.foo).toBe(result.bar.baz)
        })

        test('handles multiple self-references', () => {
            const original = { id: 1 }
            original.refA = original
            original.refB = original

            const result = jss.decode(jss.encode(original))

            expect(result.refA).toBe(result)
            expect(result.refB).toBe(result)
        })
    })

    describe('Shared References', () => {
        test('shared object referenced twice', () => {
            const shared = { value: 42 }
            const original = {
                first: shared,
                second: shared
            }

            const result = jss.decode(jss.encode(original))

            expect(result.first.value).toBe(42)
            expect(result.second.value).toBe(42)
            expect(result.first).toBe(result.second) // same object reference
        })

        test('shared object in array', () => {
            const shared = { id: 'shared' }
            const original = {
                items: [shared, shared, shared]
            }

            const result = jss.decode(jss.encode(original))

            expect(result.items[0]).toBe(result.items[1])
            expect(result.items[1]).toBe(result.items[2])
        })

        test('deeply nested shared reference', () => {
            const shared = { data: 'test' }
            const original = {
                level1: {
                    level2: {
                        ref: shared
                    }
                },
                otherRef: shared
            }

            const result = jss.decode(jss.encode(original))

            expect(result.level1.level2.ref.data).toBe('test')
            expect(result.level1.level2.ref).toBe(result.otherRef)
        })
    })

    describe('Round-trip', () => {
        test('object with multiple special types survives round-trip', () => {
            const original = {
                id: 123,
                name: 'Test',
                createdAt: new Date(),
                tags: new Set(['a', 'b']),
                meta: new Map([['x', 1]])
            }
            const result = jss.parse(jss.stringify(original))

            expect(result.id).toBe(original.id)
            expect(result.name).toBe(original.name)
            expect(result.createdAt.getTime()).toBe(original.createdAt.getTime())
            expect(result.tags).toBeInstanceOf(Set)
            expect(result.meta).toBeInstanceOf(Map)
        })
    })

    describe('Error Type Reconstruction', () => {
        test('preserves TypeError', () => {
            const error = new TypeError('Not a function')
            const input = { err: error }
            const result = jss.parse(jss.stringify(input))
            expect(result.err).toBeInstanceOf(TypeError)
            expect(result.err.message).toBe('Not a function')
        })

        test('preserves RangeError', () => {
            const error = new RangeError('Out of bounds')
            const input = { err: error }
            const result = jss.parse(jss.stringify(input))
            expect(result.err).toBeInstanceOf(RangeError)
            expect(result.err.message).toBe('Out of bounds')
        })

        test('falls back for custom error name not in global', () => {
            // Manually create encoded error with non-existent error type
            const encoded = { 'err<!E>': ['NonExistentError', 'test message', 'stack trace'] }
            const decoded = jss.decode(encoded)
            expect(decoded.err).toBeInstanceOf(Error)
            expect(decoded.err.name).toBe('NonExistentError')
            expect(decoded.err.message).toBe('test message')
            expect(decoded.err.stack).toBe('stack trace')
        })

        test('falls back when global name exists but is not an Error constructor (line 153)', () => {
            // Use a global that exists but doesn't produce Error: like Array, Object, String
            // global['String']('test') produces 'test' (a string), not an Error
            const encoded = { 'err<!E>': ['String', 'test message', 'stack trace'] }
            const decoded = jss.decode(encoded)
            // Should fall back to generic Error
            expect(decoded.err).toBeInstanceOf(Error)
            expect(decoded.err.name).toBe('String')
            expect(decoded.err.message).toBe('test message')
        })

        test('falls back when global name is a non-constructor (line 153)', () => {
            // Use something that exists but new X() doesn't produce an Error
            const encoded = { 'err<!E>': ['Object', 'test message', 'stack trace'] }
            const decoded = jss.decode(encoded)
            expect(decoded.err).toBeInstanceOf(Error)
            expect(decoded.err.name).toBe('Object')
        })
    })

    describe('Array Type Tags', () => {
        test('handles array of dates', () => {
            const dates = [new Date('2025-01-01'), new Date('2025-06-15')]
            const input = { dates }
            const result = jss.parse(jss.stringify(input))
            expect(result.dates[0]).toBeInstanceOf(Date)
            expect(result.dates[1]).toBeInstanceOf(Date)
        })

        test('handles incomplete array type tag (missing closing bracket)', () => {
            // The tag format is <!...> - if tag starts with [ but lacks ]
            // The regex matches <!...> so we need 'dates<![D,D,D>' where tag is '[D,D,D'
            const encoded = { 'dates<![D,D,D>': [1735689600000, 1750032000000, 1750118400000] }
            const decoded = jss.decode(encoded)
            // Should still decode dates properly after tag reconstruction (adds the missing ])
            expect(decoded.dates[0]).toBeInstanceOf(Date)
            expect(decoded.dates[1]).toBeInstanceOf(Date)
            expect(decoded.dates[2]).toBeInstanceOf(Date)
        })
    })

    // ========================================================================
    // Coverage for the I-tag (inline base64 binary) and the recursion-depth
    // guard. Inline binary is how server-side payloads ship Buffer data to
    // browser clients; the depth guard protects against pathological nesting.
    // ========================================================================
    describe('Inline base64 binary decoding (I-tag)', () => {
        // Scenario: a server-side response includes a small Buffer encoded
        // inline as base64 using the I-tag. In Node, the decoder returns
        // a Buffer; the test environment is Node so the `typeof Buffer
        // !== "undefined"` branch's Node arm engages.
        test('decodes I-tag base64 to Buffer in Node', () => {
            const payload = Buffer.from('hello inline').toString('base64')
            const encoded = { 'blob<!I>': payload }
            const decoded = jss.decode(encoded)
            expect(Buffer.isBuffer(decoded.blob)).toBe(true)
            expect(decoded.blob.toString()).toBe('hello inline')
        })

        // Scenario: a browser environment where Buffer is undefined. The
        // browser arm (atob + Uint8Array) engages. We simulate this by
        // temporarily hiding the global Buffer while re-requiring the
        // decoder, then restoring it.
        test('decodes I-tag base64 to Uint8Array.buffer in browser-like env', () => {
            const realBuffer = global.Buffer
            const text = 'hi browser'
            // Pre-compute the base64 payload BEFORE shadowing Buffer
            const payload = realBuffer.from(text).toString('base64')
            try {
                // Hide Buffer to make the typeof check fail inside the I-tag
                delete global.Buffer
                global.atob = (b64) => realBuffer.from(b64, 'base64').toString('binary')
                jest.isolateModules(() => {
                    // Fresh module pickup so the I-tag closure re-evaluates typeof Buffer
                    const freshJss = require('./jss')
                    const decoded = freshJss.decode({ 'blob<!I>': payload })
                    // Should be an ArrayBuffer (from Uint8Array.buffer)
                    expect(decoded.blob).toBeInstanceOf(ArrayBuffer)
                    expect(new Uint8Array(decoded.blob)).toEqual(
                        new Uint8Array([...text].map(c => c.charCodeAt(0))),
                    )
                })
            } finally {
                global.Buffer = realBuffer
                delete global.atob
            }
        })
    })

    describe('Recursion depth guard', () => {
        // Scenario: an attacker submits a pathologically nested payload to
        // trigger stack exhaustion. The decoder must reject before recursing
        // past MAX_DECODE_DEPTH (500).
        test('throws when decoded structure exceeds MAX_DECODE_DEPTH', () => {
            // Build a >500-deep nested object
            let nested = { leaf: 1 }
            for (let i = 0; i < 510; i++) {
                nested = { nested }
            }
            expect(() => jss.decode(nested)).toThrow(/depth limit exceeded/)
        })
    })

    describe('Top-level arrays', () => {
        // Scenario: a controller returns a bare array (not wrapped in an
        // object). The encoder must walk the array's numeric indices and
        // produce a parseable JSON. Exercises the `Array.isArray(obj)` truthy
        // branch in encode() at L269-271.
        test('encodes a top-level array of mixed types without throwing', () => {
            const input = [1, 'two', true, null, new Date('2024-01-01T00:00:00Z')]
            const encoded = jss.stringify(input)
            expect(typeof encoded).toBe('string')
            expect(encoded.length).toBeGreaterThan(0)
        })
    })
})
