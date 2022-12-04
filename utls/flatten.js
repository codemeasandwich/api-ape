function flattenObject(ob, prefix = false, result = null) {
  result = result || {};

  // Preserve empty objects and arrays, they are lost otherwise
  if (prefix
  && 'object' === typeof ob
  && ob !== null
  && 0 === Object.keys(ob).length) {
    result[prefix] = Array.isArray(ob) ? [] : {};
    return result;
  }

  prefix = prefix ? prefix + '.' : '';

  for (const i in ob) {
    if (Object.prototype.hasOwnProperty.call(ob, i)) {
      // Only recurse on true objects and arrays, ignore custom classes like dates
      if ('object' === typeof ob[i]
      && (Array.isArray(ob[i]) || Object.prototype.toString.call(ob[i]) === '[object Object]')
      && ob[i] !== null) {
        // Recursion on deeper objects
        flattenObject(ob[i], prefix + i, result);
      } else {
        result[prefix + i] = ob[i];
      }
    } // END if
  } // END for
  return result;
} // END flattenObject

module.exports = flattenObject
