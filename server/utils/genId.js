function genId(size, range) {
  
  size  = size ||  10
  range = range|| "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  
  if ('number' !== typeof size ) {
    throw new Error("size must be a number")
  } else if (1 > size) {
    throw new Error("positive size needed")
  } else if ('string' !== typeof range ) {
    throw new Error("range must be a string")
  } else if (1 > range.length) {
    throw new Error("range to small")
  }
  
  var id = ""
  
  for (var i = 0; i < size; i++) {
    id += range[~~(Math.random() * range.length)]
  }
  return id
} // END genId

module.exports = genId