const jjs = require('./jjs')

describe('JJS - JSON SuperSet', () => {

    describe('Primitives', () => {
        test('handles strings', () => {
            const input = { str: 'hello world' }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.str).toBe('hello world')
        })

        test('handles numbers', () => {
            const input = { int: 42, float: 3.14, neg: -100 }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.int).toBe(42)
            expect(result.float).toBe(3.14)
            expect(result.neg).toBe(-100)
        })

        test('handles booleans', () => {
            const input = { t: true, f: false }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.t).toBe(true)
            expect(result.f).toBe(false)
        })

        test('handles null', () => {
            const input = { n: null }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.n).toBe(null)
        })
    })

    describe('Special Types', () => {
        test('preserves Date objects', () => {
            const date = new Date('2025-01-01T12:00:00Z')
            const input = { created: date }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.created).toBeInstanceOf(Date)
            expect(result.created.getTime()).toBe(date.getTime())
        })

        test('encodes RegExp objects', () => {
            const regex = /hello/
            const input = { pattern: regex }
            const result = jjs.parse(jjs.stringify(input))
            // RegExp is encoded/decoded - verify it's a RegExp
            expect(result.pattern).toBeInstanceOf(RegExp)
        })

        test('preserves Error objects', () => {
            const error = new Error('Something went wrong')
            error.name = 'CustomError'
            const input = { err: error }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.err).toBeInstanceOf(Error)
            expect(result.err.message).toBe('Something went wrong')
            expect(result.err.name).toBe('CustomError')
        })

        test('handles undefined in objects', () => {
            const input = { defined: 'yes', notDefined: undefined }
            const result = jjs.parse(jjs.stringify(input))
            // undefined properties should round-trip
            expect(result.notDefined).toBe(undefined)
        })

        test('preserves Set objects', () => {
            const set = new Set([1, 2, 3, 'a', 'b'])
            const input = { items: set }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.items).toBeInstanceOf(Set)
            expect(result.items.has(1)).toBe(true)
            expect(result.items.has('a')).toBe(true)
            expect(result.items.size).toBe(5)
        })

        test('preserves Map objects', () => {
            const map = new Map([['key1', 'value1'], ['key2', 42]])
            const input = { data: map }
            const result = jjs.parse(jjs.stringify(input))
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
            const result = jjs.parse(jjs.stringify(input))
            expect(result.user.name).toBe('Alice')
            expect(result.user.profile.age).toBe(30)
        })

        test('handles arrays', () => {
            const input = { items: [1, 2, 3, 'four', 'five'] }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.items).toEqual([1, 2, 3, 'four', 'five'])
        })

        test('handles arrays with Dates', () => {
            const date = new Date('2025-06-15')
            const input = { mixed: ['text', 42, date, null] }
            const result = jjs.parse(jjs.stringify(input))
            expect(result.mixed[0]).toBe('text')
            expect(result.mixed[1]).toBe(42)
            expect(result.mixed[2]).toBeInstanceOf(Date)
            expect(result.mixed[3]).toBe(null)
        })
    })

    describe('encode/decode', () => {
        test('encode returns tagged object for Date', () => {
            const input = { d: new Date('2025-01-01') }
            const encoded = jjs.encode(input)
            expect(encoded['d<!D>']).toBeDefined()
        })

        test('decode restores Date from tagged object', () => {
            const encoded = { 'd<!D>': 1735689600000 }
            const decoded = jjs.decode(encoded)
            expect(decoded.d).toBeInstanceOf(Date)
        })

        test('encode handles Error type', () => {
            const input = { e: new Error('test') }
            const encoded = jjs.encode(input)
            expect(encoded['e<!E>']).toBeDefined()
        })

        test('encode handles Set type', () => {
            const input = { s: new Set([1, 2]) }
            const encoded = jjs.encode(input)
            expect(encoded['s<!S>']).toBeDefined()
        })

        test('encode handles Map type', () => {
            const input = { m: new Map([['a', 1]]) }
            const encoded = jjs.encode(input)
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

            const encoded = jjs.encode(original)
            const result = jjs.decode(encoded)

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

            const encoded = jjs.encode(original)
            const result = jjs.decode(encoded)

            expect(result.cat.foo).toBe(result.bar.baz)
        })

        test('handles multiple self-references', () => {
            const original = { id: 1 }
            original.refA = original
            original.refB = original

            const result = jjs.decode(jjs.encode(original))

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

            const result = jjs.decode(jjs.encode(original))

            expect(result.first.value).toBe(42)
            expect(result.second.value).toBe(42)
            expect(result.first).toBe(result.second) // same object reference
        })

        test('shared object in array', () => {
            const shared = { id: 'shared' }
            const original = {
                items: [shared, shared, shared]
            }

            const result = jjs.decode(jjs.encode(original))

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

            const result = jjs.decode(jjs.encode(original))

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
            const result = jjs.parse(jjs.stringify(original))

            expect(result.id).toBe(original.id)
            expect(result.name).toBe(original.name)
            expect(result.createdAt.getTime()).toBe(original.createdAt.getTime())
            expect(result.tags).toBeInstanceOf(Set)
            expect(result.meta).toBeInstanceOf(Map)
        })
    })
})
