/**
 * Create test data with all JSS types
 *
 * @returns {Object} Test data object
 */
function createTestData() {
  return {
    date: new Date(),
    dateSpecific: new Date('2024-06-15T10:30:00Z'),
    regex: /test-pattern/gi,
    regexComplex: /^[a-z]+\d{2,4}$/im,
    error: new Error('test error'),
    set: new Set([1, 2, 3, 'a', 'b', 'c']),
    setMixed: new Set([1, 'two', true, null]),
    map: new Map([['key1', 'value1'], ['key2', 2]]),
    mapComplex: new Map([[1, 'one'], ['two', 2], [true, 'yes']]),
    undef: undefined,
  };
}

module.exports = createTestData;
