/**
 * Assert that a value is of a specific JSS type
 *
 * @param {Object} options - Options
 * @param {any} options.value - Value to check
 * @param {string} options.type - Expected type: 'date', 'regexp', 'error', 'set', 'map'
 * @returns {void}
 */
function assertType({ value, type }) {
  const typeChecks = {
    date: (v) => v instanceof Date,
    regexp: (v) => v instanceof RegExp,
    error: (v) => v instanceof Error,
    set: (v) => v instanceof Set,
    map: (v) => v instanceof Map,
  };

  const check = typeChecks[type.toLowerCase()];
  if (!check) {
    throw new Error(`assertType: unknown type '${type}'`);
  }

  if (!check(value)) {
    throw new Error(`assertType: expected ${type} but got ${typeof value}`);
  }
}

module.exports = assertType;
