const filter = require('./filter')

describe('test filter', () => {

    test('should parce string', () => {
      const parce = filter`name ! ${undefined} AND age > ${10} OR bio.mail = ${"1@2.3"} OR bio.mail = ${"1@2.3"}`
      expect(parce).toEqual(['name', '!', undefined, 'AND', 'age', '>', 10, 'OR', 'bio.mail', '=', '1@2.3', 'OR', 'bio.mail', '=', '1@2.3']);
    })
})
