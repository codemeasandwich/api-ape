const flattenObject = require('./flatten')

describe('test flattenObject', () => {

    test('should flatten an Object', () => {
      const flat = flattenObject({a:{b:1}})
      expect(flat).toEqual({"a.b":1});
    })
})
